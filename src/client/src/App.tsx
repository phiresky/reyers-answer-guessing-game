import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, splitLink, unstable_httpSubscriptionLink } from '@trpc/client'
import { trpc } from './trpc'
import { getSessionId } from './utils/storage'
import Lobby from './components/Lobby'

const queryClient = new QueryClient()

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        return op.type === 'subscription'
      },
      true: unstable_httpSubscriptionLink({
        url: 'http://localhost:4000/trpc',
        headers() {
          return {
            'x-session-id': getSessionId(),
          }
        },
      }),
      false: httpBatchLink({
        url: 'http://localhost:4000/trpc',
        headers() {
          return {
            'x-session-id': getSessionId(),
          }
        },
      }),
    }),
  ],
})

function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gray-50">
          <Lobby />
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export default App