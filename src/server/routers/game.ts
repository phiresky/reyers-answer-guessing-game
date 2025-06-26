import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { publicProcedure, router, eventEmitter } from '../trpc'
import { db, rooms, players, games, answers, guesses } from '../db'
import { generateQuestion, rateGuess } from '../services/ai'
import { observable } from '@trpc/server/observable'

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
    
  submitAnswer: publicProcedure
    .input(z.object({
      gameId: z.string(),
      playerId: z.string(),
      answer: z.string().min(1).max(500),
    }))
    .mutation(async ({ input }) => {
      const [game] = await db.select().from(games).where(eq(games.id, input.gameId)).limit(1)
      
      if (!game) {
        throw new Error('Game not found')
      }
      
      if (game.status !== 'answering') {
        throw new Error('Not currently accepting answers')
      }
      
      await db.insert(answers).values({
        gameId: input.gameId,
        playerId: input.playerId,
        answer: input.answer.trim(),
      })
      
      return { success: true }
    }),
    
  onGameUpdate: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .subscription(({ input }) => {
      return observable<{ game: any }>((emit) => {
        const onUpdate = (data: { roomId: string; game: any }) => {
          if (data.roomId === input.roomId) {
            emit.next({ game: data.game })
          }
        }
        
        eventEmitter.on('gameUpdate', onUpdate)
        
        return () => {
          eventEmitter.off('gameUpdate', onUpdate)
        }
      })
    }),
})