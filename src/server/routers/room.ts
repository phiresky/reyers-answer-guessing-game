import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { publicProcedure, router, eventEmitter } from '../trpc'
import { db, rooms, players, answers, guesses } from '../db'
import { createId } from '@paralleldrive/cuid2'
import { on } from 'events'
import type { RoomUpdateData } from '../../shared/types'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return Array.from({ length: 5 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('')
}

export const roomRouter = router({
  create: publicProcedure
    .input(z.object({
      playerName: z.string().min(1).max(50),
      sessionId: z.string(),
      country: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      let roomCode: string
      let attempts = 0
      
      do {
        roomCode = generateRoomCode()
        attempts++
        const existingRoom = await db.select().from(rooms).where(eq(rooms.code, roomCode)).limit(1)
        if (existingRoom.length === 0) break
      } while (attempts < 10)
      
      if (attempts >= 10) {
        throw new Error('Failed to generate unique room code')
      }
      
      const playerId = createId()
      
      const [room] = await db.insert(rooms).values({
        code: roomCode,
        creatorId: playerId,
        status: 'lobby',
      }).returning()
      
      await db.insert(players).values({
        id: playerId,
        roomId: room.id,
        name: input.playerName,
        country: input.country,
        sessionId: input.sessionId,
        isCreator: true,
      })
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      eventEmitter.emit('roomUpdate', { roomId: room.id, room, players: roomPlayers })
      
      return { room, playerId }
    }),
    
  join: publicProcedure
    .input(z.object({
      roomCode: z.string().length(5),
      playerName: z.string().min(1).max(50),
      sessionId: z.string(),
      country: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, input.roomCode.toUpperCase())).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      if (room.status !== 'lobby') {
        throw new Error('Room is not accepting new players')
      }
      
      const existingPlayer = await db.select().from(players).where(
        and(eq(players.roomId, room.id), eq(players.sessionId, input.sessionId))
      ).limit(1)
      
      if (existingPlayer.length > 0) {
        await db.update(players)
          .set({ 
            name: input.playerName, 
            lastSeen: new Date(),
            status: 'online' 
          })
          .where(eq(players.id, existingPlayer[0].id))
        
        const roomPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
        eventEmitter.emit('roomUpdate', { roomId: room.id, room, players: roomPlayers })
        
        return { room, playerId: existingPlayer[0].id }
      }
      
      const [player] = await db.insert(players).values({
        roomId: room.id,
        name: input.playerName,
        country: input.country,
        sessionId: input.sessionId,
        isCreator: false,
      }).returning()
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      eventEmitter.emit('roomUpdate', { roomId: room.id, room, players: roomPlayers })
      
      return { room, playerId: player.id }
    }),
    
  getRoom: publicProcedure
    .input(z.object({
      roomId: z.string(),
      sessionId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      
      let currentPlayerId = null
      if (input.sessionId) {
        const existingPlayer = await db.select().from(players).where(
          and(eq(players.roomId, room.id), eq(players.sessionId, input.sessionId))
        ).limit(1)
        
        if (existingPlayer.length > 0) {
          currentPlayerId = existingPlayer[0].id
          // Update their status to online
          await db.update(players)
            .set({ 
              lastSeen: new Date(),
              status: 'online' 
            })
            .where(eq(players.id, existingPlayer[0].id))
        }
      }
      
      return { room, players: roomPlayers, currentPlayerId }
    }),
    
  getRoomByCode: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      sessionId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, input.roomCode.toUpperCase())).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      
      let currentPlayerId = null
      if (input.sessionId) {
        const existingPlayer = await db.select().from(players).where(
          and(eq(players.roomId, room.id), eq(players.sessionId, input.sessionId))
        ).limit(1)
        
        if (existingPlayer.length > 0) {
          currentPlayerId = existingPlayer[0].id
          // Update their status to online
          await db.update(players)
            .set({ 
              lastSeen: new Date(),
              status: 'online' 
            })
            .where(eq(players.id, existingPlayer[0].id))
        }
      }
      
      return { room, players: roomPlayers, currentPlayerId }
    }),
    
  updatePlayerStatus: publicProcedure
    .input(z.object({
      playerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.update(players)
        .set({ 
          lastSeen: new Date(),
          status: 'online' 
        })
        .where(eq(players.id, input.playerId))
      
      const [player] = await db.select().from(players).where(eq(players.id, input.playerId)).limit(1)
      if (player) {
        const [room] = await db.select().from(rooms).where(eq(rooms.id, player.roomId)).limit(1)
        const roomPlayers = await db.select().from(players).where(eq(players.roomId, player.roomId))
        eventEmitter.emit('roomUpdate', { roomId: player.roomId, room, players: roomPlayers })
      }
      
      return { success: true }
    }),
    
  markPlayerOffline: publicProcedure
    .input(z.object({
      playerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Mark as offline and update lastSeen timestamp
      await db.update(players)
        .set({ 
          status: 'offline',
          lastSeen: new Date()
        })
        .where(eq(players.id, input.playerId))
      
      const [player] = await db.select().from(players).where(eq(players.id, input.playerId)).limit(1)
      if (player) {
        const [room] = await db.select().from(rooms).where(eq(rooms.id, player.roomId)).limit(1)
        const roomPlayers = await db.select().from(players).where(eq(players.roomId, player.roomId))
        eventEmitter.emit('roomUpdate', { roomId: player.roomId, room, players: roomPlayers })
      }
      
      return { success: true }
    }),
    
  leave: publicProcedure
    .input(z.object({
      playerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const [player] = await db.select().from(players).where(eq(players.id, input.playerId)).limit(1)
      
      if (!player) {
        throw new Error('Player not found')
      }
      
      // Check if player has participated in any games (has answers or guesses)
      const playerAnswers = await db.select().from(answers).where(eq(answers.playerId, input.playerId)).limit(1)
      const playerGuesses = await db.select().from(guesses).where(eq(guesses.guesserId, input.playerId)).limit(1)
      const hasPlayedRounds = playerAnswers.length > 0 || playerGuesses.length > 0
      
      if (hasPlayedRounds) {
        // Player has played rounds, so just mark them as offline instead of deleting
        await db.update(players)
          .set({ 
            status: 'offline',
            lastSeen: new Date()
          })
          .where(eq(players.id, input.playerId))
      } else {
        // Player hasn't played any rounds, safe to delete completely
        await db.delete(players).where(eq(players.id, input.playerId))
      }
      
      // Get updated room state and emit update
      const [room] = await db.select().from(rooms).where(eq(rooms.id, player.roomId)).limit(1)
      if (room) {
        const remainingPlayers = await db.select().from(players).where(eq(players.roomId, player.roomId))
        
        // If no players left, delete the room
        if (remainingPlayers.length === 0) {
          await db.delete(rooms).where(eq(rooms.id, player.roomId))
        } else {
          // If the leaving player was the creator, assign a new creator
          if (player.isCreator && remainingPlayers.length > 0) {
            await db.update(players)
              .set({ isCreator: true })
              .where(eq(players.id, remainingPlayers[0].id))
              
            await db.update(rooms)
              .set({ creatorId: remainingPlayers[0].id })
              .where(eq(rooms.id, player.roomId))
          }
          
          // Emit room update with remaining players
          const updatedPlayers = await db.select().from(players).where(eq(players.roomId, player.roomId))
          eventEmitter.emit('roomUpdate', { roomId: player.roomId, room, players: updatedPlayers })
        }
      }
      
      return { success: true }
    }),

  kickPlayer: publicProcedure
    .input(z.object({
      playerId: z.string(),
      kickerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Get the player being kicked to find their room
      const [playerToKick] = await db.select().from(players).where(eq(players.id, input.playerId)).limit(1)
      
      if (!playerToKick) {
        throw new Error('Player not found')
      }
      
      // Check if kicker is the room creator
      const [room] = await db.select().from(rooms).where(eq(rooms.id, playerToKick.roomId)).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      if (room.creatorId !== input.kickerId) {
        throw new Error('Only the room creator can kick players')
      }
      
      // Cannot kick yourself
      if (input.playerId === input.kickerId) {
        throw new Error('Cannot kick yourself')
      }
      
      // Remove the player from the room
      await db.delete(players).where(eq(players.id, input.playerId))
      
      // Emit room update to notify all players
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, playerToKick.roomId))
      eventEmitter.emit('roomUpdate', { roomId: playerToKick.roomId, room, players: roomPlayers })
      
      return { success: true }
    }),
    
  onRoomUpdate: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .subscription(async function* ({ input, signal }) {
      try {
        // Send initial room state immediately when client connects
        const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
        if (room) {
          const roomPlayers = await db.select().from(players).where(eq(players.roomId, input.roomId))
          yield { room, players: roomPlayers }
        }

        // Then listen for updates
        for await (const [data] of on(eventEmitter, 'roomUpdate', {
          signal,
        })) {
          const updateData = data as RoomUpdateData
          if (updateData.roomId === input.roomId) {
            yield { room: updateData.room, players: updateData.players }
          }
        }
      } finally {
        // Cleanup if needed
      }
    }),
})