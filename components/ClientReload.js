import { useEffect } from 'react'
import Router from 'next/router'

/**
 * Client-side complement to next-remote-watch
 * Re-triggers getStaticProps when watched mdx files change
 *
 */
export const ClientReload = () => {
  // Only connect when remote watch server is running (npm run start)
  useEffect(() => {
    // Skip if not using remote watch mode
    if (typeof window === 'undefined') return

    import('socket.io-client').then((module) => {
      const socket = module.io({ reconnection: false, timeout: 1000 })
      socket.on('connect_error', () => {
        // Silently fail - remote watch server not running
        socket.disconnect()
      })
      socket.on('reload', () => {
        Router.replace(Router.asPath, undefined, {
          scroll: false,
        })
      })
    })
  }, [])

  return null
}
