import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, splitLink, httpSubscriptionLink } from '@trpc/client'
import { trpc } from './trpc'
import { getSessionId } from './utils/storage'
import Lobby from './components/Lobby'

const queryClient = new QueryClient()

// Get the base URL for tRPC API
// In development: use the dev server proxy
// In production: use relative path that works with nginx routing
const getTrpcUrl = () => {
  if (import.meta.env.DEV) {
    return 'http://localhost:4000/trpc'
  }
  
  // In production, use relative path that respects the base path
  const basePath = import.meta.env.BASE_URL + "/" || '/'
  return `${window.location.origin}${basePath}trpc`.replace(/\/+/g, '/').replace(':/', '://')
}

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        return op.type === 'subscription'
      },
      true: httpSubscriptionLink({
        url: getTrpcUrl(),
      }),
      false: httpBatchLink({
        url: getTrpcUrl(),
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