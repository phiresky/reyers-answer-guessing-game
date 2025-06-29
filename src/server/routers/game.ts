import { z } from 'zod'
import { eq, and, sql } from 'drizzle-orm'
import { publicProcedure, router, eventEmitter } from '../trpc'
import { db, rooms, players, games, answers, guesses } from '../db'
import { generateQuestion, rateGuess } from '../services/ai'
import { on } from 'events'

async function emitGameUpdateWithGuesses(roomId: string, game: any) {
  // Get guess and answer data for this game
  const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, game.id))
  const gameAnswers = await db.select().from(answers).where(eq(answers.gameId, game.id))
  eventEmitter.emit('gameUpdate', { roomId, game, guesses: gameGuesses, answers: gameAnswers })
}

async function startAIRating(gameId: string) {
  try {
    // Get all guesses for this game
    const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, gameId))
    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1)
    
    if (!game) return

    console.log(`Starting AI rating for game ${gameId} with ${gameGuesses.length} guesses`)
    
    // Process all ratings in parallel with individual error handling
    const ratingPromises = gameGuesses.map(async (guess) => {
      try {
        // Get the original answer
        const [originalAnswer] = await db.select().from(answers).where(
          and(eq(answers.gameId, gameId), eq(answers.playerId, guess.targetPlayerId))
        ).limit(1)
        
        if (!originalAnswer) {
          console.error(`No original answer found for guess ${guess.id}`)
          // Set default rating if no original answer
          await db.update(guesses)
            .set({ 
              rating: 5,
              ratedAt: new Date() 
            })
            .where(eq(guesses.id, guess.id))
          return
        }

        console.log(`Rating guess ${guess.id}: "${guess.guess}" vs "${originalAnswer.answer}"`)
        const rating = await rateGuess(originalAnswer.answer, guess.guess, game.question)
        console.log(`Rated guess ${guess.id}: ${rating}/10`)
        
        // Update the guess with the rating
        await db.update(guesses)
          .set({ 
            rating,
            ratedAt: new Date() 
          })
          .where(eq(guesses.id, guess.id))
      } catch (error) {
        console.error(`Failed to rate guess ${guess.id}:`, error)
        // Set a default rating if AI fails
        await db.update(guesses)
          .set({ 
            rating: 5,
            ratedAt: new Date() 
          })
          .where(eq(guesses.id, guess.id))
      }
    })

    // Wait for all ratings to complete
    await Promise.all(ratingPromises)
    console.log(`Completed rating for game ${gameId}`)
    
    // Calculate and award points based on ratings
    const finalGuesses = await db.select().from(guesses).where(eq(guesses.gameId, gameId))
    for (const guess of finalGuesses) {
      if (guess.rating) {
        // Award points to the player who made the guess
        await db.update(players)
          .set({ 
            totalScore: sql`${players.totalScore} + ${guess.rating}`
          })
          .where(eq(players.id, guess.guesserId))
        
        console.log(`Awarded ${guess.rating} points to player ${guess.guesserId}`)
      }
    }
    
    // Mark game as completed
    await db.update(games)
      .set({ 
        status: 'completed',
        endedAt: new Date() 
      })
      .where(eq(games.id, gameId))
    
    // Emit game update with guess data
    const updatedGame = await db.select().from(games).where(eq(games.id, gameId)).limit(1)
    await emitGameUpdateWithGuesses(game.roomId, updatedGame[0])
    
    // Also emit room update to refresh player scores
    const [room] = await db.select().from(rooms).where(eq(rooms.id, game.roomId)).limit(1)
    const updatedPlayers = await db.select().from(players).where(eq(players.roomId, game.roomId))
    if (room) {
      eventEmitter.emit('roomUpdate', { roomId: game.roomId, room, players: updatedPlayers })
    }
    
    console.log(`Game ${gameId} marked as completed and updates emitted`)
  } catch (error) {
    console.error(`Critical error in startAIRating for game ${gameId}:`, error)
    // Ensure game is marked as completed even if rating fails
    try {
      await db.update(games)
        .set({ 
          status: 'completed',
          endedAt: new Date() 
        })
        .where(eq(games.id, gameId))
      
      const updatedGame = await db.select().from(games).where(eq(games.id, gameId)).limit(1)
      if (updatedGame[0]) {
        await emitGameUpdateWithGuesses(updatedGame[0].roomId, updatedGame[0])
      }
    } catch (fallbackError) {
      console.error(`Failed to complete game ${gameId} in fallback:`, fallbackError)
    }
  }
}

export const gameRouter = router({
  updateConfig: publicProcedure
    .input(z.object({
      roomId: z.string(),
      playerId: z.string(),
      totalRounds: z.number().min(1).max(10),
      roundTimeLimit: z.number().min(30).max(600),
      initialPrompt: z.string().min(1).max(200),
    }))
    .mutation(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      if (room.creatorId !== input.playerId) {
        throw new Error('Only the room creator can update configuration')
      }
      
      if (room.status !== 'lobby') {
        throw new Error('Cannot update configuration after game has started')
      }
      
      const [updatedRoom] = await db.update(rooms)
        .set({
          totalRounds: input.totalRounds,
          roundTimeLimit: input.roundTimeLimit,
          initialPrompt: input.initialPrompt,
          updatedAt: new Date(),
        })
        .where(eq(rooms.id, input.roomId))
        .returning()
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, input.roomId))
      eventEmitter.emit('roomUpdate', { roomId: input.roomId, room: updatedRoom, players: roomPlayers })
      
      return { success: true }
    }),
    
  startGame: publicProcedure
    .input(z.object({
      roomId: z.string(),
      playerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      if (room.creatorId !== input.playerId) {
        throw new Error('Only the room creator can start the game')
      }
      
      if (room.status !== 'lobby') {
        throw new Error('Game has already started')
      }
      
      const [updatedRoom] = await db.update(rooms)
        .set({
          status: 'playing',
          currentRound: 1,
          updatedAt: new Date(),
        })
        .where(eq(rooms.id, input.roomId))
        .returning()
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, input.roomId))
      eventEmitter.emit('roomUpdate', { roomId: input.roomId, room: updatedRoom, players: roomPlayers })
      
      return { success: true }
    }),
    
  getCurrentGame: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .query(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      if (room.status !== 'playing') {
        return null
      }
      
      const [currentGame] = await db.select().from(games)
        .where(and(eq(games.roomId, input.roomId), eq(games.round, room.currentRound)))
        .limit(1)
      
      if (!currentGame) {
        try {
          // Get previous questions from this room to avoid duplicates
          const previousGames = await db.select({ question: games.question }).from(games)
            .where(eq(games.roomId, input.roomId))
          const previousQuestions = previousGames.map(g => g.question)
          
          const questionStream = await generateQuestion(room.initialPrompt, previousQuestions)
          let question = ''
          
          for await (const chunk of questionStream) {
            question += chunk
          }
          
          const [newGame] = await db.insert(games).values({
            roomId: input.roomId,
            round: room.currentRound,
            question: question.trim(),
            status: 'answering',
          }).returning()
          
          await emitGameUpdateWithGuesses(input.roomId, newGame)
          
          // Return same data structure as subscription
          const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, newGame.id))
          const gameAnswers = await db.select().from(answers).where(eq(answers.gameId, newGame.id))
          return { game: newGame, guesses: gameGuesses, answers: gameAnswers }
        } catch (error) {
          // If insert fails due to unique constraint (another player created the game), 
          // retry the query to get the existing game
          const [existingGame] = await db.select().from(games)
            .where(and(eq(games.roomId, input.roomId), eq(games.round, room.currentRound)))
            .limit(1)
          
          if (existingGame) {
            const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, existingGame.id))
            const gameAnswers = await db.select().from(answers).where(eq(answers.gameId, existingGame.id))
            return { game: existingGame, guesses: gameGuesses, answers: gameAnswers }
          }
          
          // If still no game found, re-throw the error
          throw error
        }
      }
      
      // Return same data structure as subscription
      const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, currentGame.id))
      const gameAnswers = await db.select().from(answers).where(eq(answers.gameId, currentGame.id))
      return { game: currentGame, guesses: gameGuesses, answers: gameAnswers }
    }),
    
  saveAnswer: publicProcedure
    .input(z.object({
      gameId: z.string(),
      playerId: z.string(),
      answer: z.string().min(1).max(500),
      submit: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        throw new Error('Game not found')
      }
      
      if (game.status !== 'answering') {
        throw new Error('Not currently accepting answers')
      }
      
      // Check if player already has an answer
      const existingAnswer = await db.select().from(answers).where(
        and(eq(answers.gameId, input.gameId), eq(answers.playerId, input.playerId))
      ).limit(1)
      
      if (existingAnswer.length > 0) {
        // Update existing answer
        await db.update(answers)
          .set({
            answer: input.answer.trim(),
            isSubmitted: input.submit || existingAnswer[0].isSubmitted,
            submittedAt: input.submit ? new Date() : existingAnswer[0].submittedAt,
            updatedAt: new Date(),
          })
          .where(eq(answers.id, existingAnswer[0].id))
      } else {
        // Create new answer
        await db.insert(answers).values({
          gameId: input.gameId,
          playerId: input.playerId,
          answer: input.answer.trim(),
          isSubmitted: input.submit || false,
          submittedAt: input.submit ? new Date() : null,
        })
      }
      
      // Emit game update with guess data when answers are submitted
      // This allows other players to see updated activity status
      await emitGameUpdateWithGuesses(game.roomId, game)
      
      return { success: true }
    }),
    
  getGameAnswers: publicProcedure
    .input(z.object({
      gameId: z.string(),
    }))
    .query(async ({ input }) => {
      const gameAnswers = await db.select().from(answers).where(eq(answers.gameId, input.gameId))
      return gameAnswers
    }),
    
  saveGuess: publicProcedure
    .input(z.object({
      gameId: z.string(),
      guesserId: z.string(),
      targetPlayerId: z.string(),
      guess: z.string().min(1).max(500),
      submit: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        throw new Error('Game not found')
      }
      
      if (game.status !== 'answering') {
        throw new Error('Not currently accepting guesses')
      }
      
      // Check if guess already exists
      const existingGuess = await db.select().from(guesses).where(
        and(
          eq(guesses.gameId, input.gameId),
          eq(guesses.guesserId, input.guesserId),
          eq(guesses.targetPlayerId, input.targetPlayerId)
        )
      ).limit(1)
      
      if (existingGuess.length > 0) {
        // Update existing guess
        await db.update(guesses)
          .set({
            guess: input.guess.trim(),
            isSubmitted: input.submit || existingGuess[0].isSubmitted,
            submittedAt: input.submit ? new Date() : existingGuess[0].submittedAt,
            updatedAt: new Date(),
          })
          .where(eq(guesses.id, existingGuess[0].id))
      } else {
        // Create new guess
        await db.insert(guesses).values({
          gameId: input.gameId,
          guesserId: input.guesserId,
          targetPlayerId: input.targetPlayerId,
          guess: input.guess.trim(),
          isSubmitted: input.submit || false,
          submittedAt: input.submit ? new Date() : null,
        })
      }
      
      // Emit game update with guess data when guesses are submitted
      // This allows other players to see updated activity status
      await emitGameUpdateWithGuesses(game.roomId, game)
      
      return { success: true }
    }),
    
  checkGameProgress: publicProcedure
    .input(z.object({
      gameId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        throw new Error('Game not found')
      }
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, game.roomId))
      const submittedAnswers = await db.select().from(answers).where(
        and(eq(answers.gameId, input.gameId), eq(answers.isSubmitted, true))
      )
      const submittedGuesses = await db.select().from(guesses).where(
        and(eq(guesses.gameId, input.gameId), eq(guesses.isSubmitted, true))
      )
      
      // Check if all players have submitted answers and at least one guess per player
      // In the new flow, each player submits one answer and one guess
      if (submittedAnswers.length >= roomPlayers.length && submittedGuesses.length >= roomPlayers.length) {
        // All submissions complete, move to rating phase
        await db.update(games)
          .set({ status: 'rating' })
          .where(eq(games.id, input.gameId))
          
        // Start AI rating process
        await startAIRating(input.gameId)
        
        const updatedGame = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
        await emitGameUpdateWithGuesses(game.roomId, updatedGame[0])
      }
      
      return { success: true }
    }),
    
  getGuessTarget: publicProcedure
    .input(z.object({
      gameId: z.string(),
      playerId: z.string(),
    }))
    .query(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        return null
      }
      
      // Get all players in the room
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, game.roomId))
      
      if (roomPlayers.length < 2) {
        return null
      }
      
      // Create deterministic round-robin assignment that varies by round
      // This ensures everyone gets assigned exactly one person to guess for, but the assignment changes each round
      const sortedPlayers = roomPlayers.sort((a, b) => a.id.localeCompare(b.id))
      const currentPlayerIndex = sortedPlayers.findIndex(p => p.id === input.playerId)
      
      if (currentPlayerIndex === -1) {
        return null
      }
      
      // Use the round number to rotate the assignment pattern
      // Round 1: player[0] -> player[1], player[1] -> player[2], etc.
      // Round 2: player[0] -> player[2], player[1] -> player[3], etc.
      // Round 3: player[0] -> player[3], player[1] -> player[4], etc.
      const offset = game.round % sortedPlayers.length
      const targetIndex = (currentPlayerIndex + offset) % sortedPlayers.length
      
      // If the target is the same as current player, use next player instead
      const finalTargetIndex = targetIndex === currentPlayerIndex 
        ? (currentPlayerIndex + 1) % sortedPlayers.length 
        : targetIndex
      
      const targetPlayer = sortedPlayers[finalTargetIndex]
      
      return {
        id: targetPlayer.id,
        name: targetPlayer.name
      }
    }),
    
  getGameResults: publicProcedure
    .input(z.object({
      gameId: z.string(),
    }))
    .query(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        throw new Error('Game not found')
      }
      
      const gameAnswers = await db.select().from(answers).where(eq(answers.gameId, input.gameId))
      const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, input.gameId))
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, game.roomId))
      
      // Organize results by player
      const results = gameAnswers.map(answer => {
        const player = roomPlayers.find(p => p.id === answer.playerId)
        const guess = gameGuesses.find(g => g.targetPlayerId === answer.playerId)
        const guesser = guess ? roomPlayers.find(p => p.id === guess.guesserId) : null
        
        return {
          player,
          answer: answer.answer,
          guess: guess?.guess || null,
          guesser,
          rating: guess?.rating || null,
          isRated: guess?.rating !== null,
        }
      })
      
      return { game, results }
    }),

  readyForNextRound: publicProcedure
    .input(z.object({
      gameId: z.string(),
      playerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        throw new Error('Game not found')
      }
      
      if (game.status !== 'completed') {
        throw new Error('Round not yet completed')
      }
      
      // Check if player is in this room
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, game.roomId))
      const player = roomPlayers.find(p => p.id === input.playerId)
      
      if (!player) {
        throw new Error('Player not in room')
      }
      
      // Mark player as ready for next round
      await db.update(players)
        .set({ isReadyForNextRound: true })
        .where(eq(players.id, input.playerId))
      
      // Check if all players are ready
      const readyPlayers = await db.select().from(players).where(
        and(eq(players.roomId, game.roomId), eq(players.isReadyForNextRound, true))
      )
      
      if (readyPlayers.length >= roomPlayers.length) {
        // All players ready, start next round
        console.log(`All ${roomPlayers.length} players ready, starting next round`)
        const [room] = await db.select().from(rooms).where(eq(rooms.id, game.roomId)).limit(1)
        
        if (room && room.currentRound < room.totalRounds) {
          console.log(`Moving from round ${room.currentRound} to ${room.currentRound + 1}`)
          // Move to next round
          await db.update(rooms)
            .set({ currentRound: room.currentRound + 1 })
            .where(eq(rooms.id, room.id))
          
          // Reset all player readiness for next round
          await db.update(players)
            .set({ isReadyForNextRound: false })
            .where(eq(players.roomId, game.roomId))
          
          // Emit room update to trigger new game creation
          const updatedRoom = await db.select().from(rooms).where(eq(rooms.id, room.id)).limit(1)
          const updatedPlayers = await db.select().from(players).where(eq(players.roomId, game.roomId))
          console.log(`Emitting room update for round ${updatedRoom[0].currentRound}`)
          eventEmitter.emit('roomUpdate', { roomId: room.id, room: updatedRoom[0], players: updatedPlayers })
        } else {
          console.log(`Game finished or room not found. Current round: ${room?.currentRound}, Total rounds: ${room?.totalRounds}`)
        }
      } else {
        console.log(`${readyPlayers.length}/${roomPlayers.length} players ready`)
      }
      
      return { success: true }
    }),

  getRoundReadyStatus: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .query(async ({ input }) => {
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, input.roomId))
      const readyPlayers = roomPlayers.filter(p => p.isReadyForNextRound)
      const notReadyPlayers = roomPlayers.filter(p => !p.isReadyForNextRound)
      
      return {
        readyCount: readyPlayers.length,
        totalCount: roomPlayers.length,
        notReadyPlayers: notReadyPlayers.map(p => p.name)
      }
    }),
    
  onGameUpdate: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .subscription(async function* ({ input, signal }) {
      try {
        for await (const [data] of on(eventEmitter, 'gameUpdate', {
          signal,
        })) {
          const updateData = data as { roomId: string; game: any; guesses: any[]; answers: any[] }
          if (updateData.roomId === input.roomId) {
            yield { game: updateData.game, guesses: updateData.guesses, answers: updateData.answers }
          }
        }
      } finally {
        // Cleanup if needed
      }
    }),
})