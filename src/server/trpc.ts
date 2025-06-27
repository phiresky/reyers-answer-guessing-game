import { initTRPC } from '@trpc/server'
import { EventEmitter } from 'events'
import type { RoomUpdateData, GameUpdateData } from '../shared/types'

export const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

export interface Context {
  sessionId?: string
}

interface ServerEventMap {
  roomUpdate: [data: RoomUpdateData]
  gameUpdate: [data: GameUpdateData]
}

export const eventEmitter = new EventEmitter<ServerEventMap>()