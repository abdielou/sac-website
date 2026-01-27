'use client'

import { ThemeProvider } from 'next-themes'
import Analytics from '@/components/analytics'
import { ClientReload } from '@/components/ClientReload'

const isDevelopment = process.env.NODE_ENV === 'development'

export function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="theme">
      {isDevelopment && <ClientReload />}
      <Analytics />
      {children}
    </ThemeProvider>
  )
}
