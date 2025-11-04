import '@/css/tailwind.css'
import '@/css/prism.css'

import { ThemeProvider } from 'next-themes'
import Head from 'next/head'
import { useRouter } from 'next/router'

import Analytics from '@/components/analytics'
import LayoutWrapper from '@/components/LayoutWrapper'
import { ClientReload } from '@/components/ClientReload'

const isDevelopment = process.env.NODE_ENV === 'development'

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const forcedTheme = router.pathname === '/links' ? 'light' : undefined
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="theme"
      forcedTheme={forcedTheme}
    >
      <Head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
      </Head>
      {isDevelopment && <ClientReload />}
      <Analytics />
      <LayoutWrapper forceLightHeader={router.pathname === '/links'}>
        <Component {...pageProps} />
      </LayoutWrapper>
    </ThemeProvider>
  )
}
