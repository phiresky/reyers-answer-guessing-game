import fastify from 'fastify'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { appRouter } from './routers'
import type { Context } from './trpc'

const server = fastify({
  maxParamLength: 5000,
  logger: true
})

server.register(cors, {
  origin: ['http://localhost:3000'],
  credentials: true,
})

server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { 
    router: appRouter,
    createContext: ({ req }): Context => {
      const sessionId = req.headers['x-session-id'] as string
      return { sessionId }
    },
  },
})

const port = 4000;
const start = async () => {
  try {
    await server.listen({ port })
    console.log(`Server is running on http://localhost:${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()