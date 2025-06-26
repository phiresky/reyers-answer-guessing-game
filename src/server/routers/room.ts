import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { publicProcedure, router, eventEmitter } from '../trpc'
import { db, rooms, players } from '../db'
import { createId } from '@paralleldrive/cuid2'
import { on } from 'events'

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
    }))
    .query(async ({ input }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1)
      
      if (!room) {
        throw new Error('Room not found')
      }
      
      const roomPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      
      return { room, players: roomPlayers }
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
    
  leave: publicProcedure
    .input(z.object({
      playerId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db.update(players)
        .set({ status: 'offline' })
        .where(eq(players.id, input.playerId))
      
      const [player] = await db.select().from(players).where(eq(players.id, input.playerId)).limit(1)
      if (player) {
        const [room] = await db.select().from(rooms).where(eq(rooms.id, player.roomId)).limit(1)
        const roomPlayers = await db.select().from(players).where(eq(players.roomId, player.roomId))
        eventEmitter.emit('roomUpdate', { roomId: player.roomId, room, players: roomPlayers })
      }
      
      return { success: true }
    }),
    
  onRoomUpdate: publicProcedure
    .input(z.object({
      roomId: z.string(),
    }))
    .subscription(async function* ({ input, signal }) {
      try {
        for await (const [data] of on(eventEmitter, 'roomUpdate', {
          signal,
        })) {
          const updateData = data as { roomId: string; room: any; players: any[] }
          if (updateData.roomId === input.roomId) {
            yield { room: updateData.room, players: updateData.players }
          }
        }
      } finally {
        // Cleanup if needed
      }
    }),
})