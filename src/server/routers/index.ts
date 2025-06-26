import { router } from '../trpc'
import { roomRouter } from './room'
import { gameRouter } from './game'

export const appRouter = router({
  room: roomRouter,
  game: gameRouter,
})

export type AppRouter = typeof appRouter