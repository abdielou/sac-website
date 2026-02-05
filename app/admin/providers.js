'use client'

import { QueryClient, QueryClientProvider, isServer } from '@tanstack/react-query'

/**
 * Create a new QueryClient with admin-specific defaults
 * staleTime: 1 minute - data considered fresh, won't refetch on mount
 * gcTime: 5 minutes - keep unused data in cache before garbage collection
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes
        retry: 1, // Only retry once on failure
        refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      },
    },
  })
}

// Browser-only singleton to prevent creating multiple clients
let browserQueryClient

function getQueryClient() {
  if (isServer) {
    // Server: always create a new client to prevent sharing state
    return makeQueryClient()
  }

  // Browser: use singleton
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

/**
 * AdminProviders wraps admin pages with QueryClientProvider
 * Use in app/admin/layout.js to enable TanStack Query for all admin routes
 */
export function AdminProviders({ children }) {
  const queryClient = getQueryClient()

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
