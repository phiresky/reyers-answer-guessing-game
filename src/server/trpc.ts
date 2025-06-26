import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { db } from './db'
import { observable } from '@trpc/server/observable'
import { EventEmitter } from 'events'

export const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

export interface Context {
  sessionId?: string
}

export const eventEmitter = new EventEmitter()