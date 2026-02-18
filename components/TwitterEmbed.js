'use client'

import { useEffect, useRef } from 'react'

const TwitterEmbed = ({ url, tweetId }) => {
  const resolvedId = tweetId || url?.match(/status\/(\d+)/)?.[1]
  const ref = useRef(null)

  useEffect(() => {
    if (!resolvedId || !ref.current) return
    let intervalId = null

    // Defer to coalesce React StrictMode double-invoke
    const timer = setTimeout(() => {
      if (!ref.current) return
      ref.current.innerHTML = ''

      // Ensure Twitter widgets script is on the page
      if (!document.querySelector('script[src="https://platform.twitter.com/widgets.js"]')) {
        const script = document.createElement('script')
        script.src = 'https://platform.twitter.com/widgets.js'
        script.async = true
        document.body.appendChild(script)
      }

      // Use createTweet API — more reliable for dynamically rendered content
      const createEmbed = () => {
        if (window.twttr?.widgets && ref.current) {
          window.twttr.widgets.createTweet(resolvedId, ref.current)
        }
      }

      if (window.twttr?.widgets) {
        createEmbed()
      } else {
        intervalId = setInterval(() => {
          if (window.twttr?.widgets) {
            clearInterval(intervalId)
            createEmbed()
          }
        }, 200)
      }
    }, 0)

    return () => {
      clearTimeout(timer)
      if (intervalId) clearInterval(intervalId)
    }
  }, [resolvedId])

  if (!resolvedId) return null

  return <div ref={ref} />
}

export default TwitterEmbed
