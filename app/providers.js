'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'
import Analytics from '@/components/analytics'
import { ClientReload } from '@/components/ClientReload'

const isDevelopment = process.env.NODE_ENV === 'development'

export function Providers({ children }) {
  const pathname = usePathname()

  // Force light theme for /links page (social links page)
  const forcedTheme = pathname === '/links' ? 'light' : undefined

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="theme"
        forcedTheme={forcedTheme}
      >
        {isDevelopment && <ClientReload />}
        <Analytics />
        {children}
      </ThemeProvider>
    </SessionProvider>
  )
}
