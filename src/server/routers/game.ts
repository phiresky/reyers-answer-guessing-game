import { z } from 'zod'
import { eq, desc, and, ne } from 'drizzle-orm'
import { publicProcedure, router, eventEmitter } from '../trpc'
import { db, rooms, players, games, answers, guesses } from '../db'
import { generateQuestion, rateGuess } from '../services/ai'
import { on } from 'events'

async function startAIRating(gameId: string) {
  // Get all guesses for this game
  const gameGuesses = await db.select().from(guesses).where(eq(guesses.gameId, gameId))
  const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1)
  
  if (!game) return
  
  // Rate each guess
  for (const guess of gameGuesses) {
    // Get the original answer
    const [originalAnswer] = await db.select().from(answers).where(
      and(eq(answers.gameId, gameId), eq(answers.playerId, guess.targetPlayerId))
    ).limit(1)
    
    if (originalAnswer) {
      try {
        const rating = await rateGuess(originalAnswer.answer, guess.guess, game.question)
        
        // Update the guess with the rating
        await db.update(guesses)
          .set({ 
            rating,
            ratedAt: new Date() 
          })
          .where(eq(guesses.id, guess.id))
      } catch (error) {
        console.error('Failed to rate guess:', error)
        // Set a default rating if AI fails
        await db.update(guesses)
          .set({ 
            rating: 5,
            ratedAt: new Date() 
          })
          .where(eq(guesses.id, guess.id))
      }
    }
  }
  
  // Mark game as completed
  await db.update(games)
    .set({ 
      status: 'completed',
      endedAt: new Date() 
    })
    .where(eq(games.id, gameId))
  
  // Emit game update
  const updatedGame = await db.select().from(games).where(eq(games.id, gameId)).limit(1)
  eventEmitter.emit('gameUpdate', { roomId: game.roomId, game: updatedGame[0] })
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
        .where(eq(games.roomId, input.roomId))
        .orderBy(desc(games.round))
        .limit(1)
      
      if (!currentGame) {
        const questionStream = await generateQuestion(room.initialPrompt)
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
        
        eventEmitter.emit('gameUpdate', { roomId: input.roomId, game: newGame })
        return newGame
      }
      
      return currentGame
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
        eventEmitter.emit('gameUpdate', { roomId: game.roomId, game: updatedGame[0] })
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
      
      if (!game || game.status !== 'guessing') {
        return null
      }
      
      // Get all players in the room except the current player
      const roomPlayers = await db.select().from(players).where(
        and(eq(players.roomId, game.roomId), ne(players.id, input.playerId))
      )
      
      if (roomPlayers.length === 0) {
        return null
      }
      
      // Simple random assignment for now
      // In a real game, you might want more sophisticated assignment logic
      const randomIndex = Math.floor(Math.random() * roomPlayers.length)
      return roomPlayers[randomIndex]
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
    
  onGameUpdate: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .subscription(async function* ({ input, signal }) {
      try {
        for await (const [data] of on(eventEmitter, 'gameUpdate', {
          signal,
        })) {
          const updateData = data as { roomId: string; game: any }
          if (updateData.roomId === input.roomId) {
            yield { game: updateData.game }
          }
        }
      } finally {
        // Cleanup if needed
      }
    }),
})