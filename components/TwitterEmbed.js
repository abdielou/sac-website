'use client'

import { useEffect } from 'react'

const TwitterEmbed = ({ url, tweetId }) => {
  const tweetUrl = url || (tweetId ? `https://twitter.com/i/status/${tweetId}` : null)

  useEffect(() => {
    if (!tweetUrl) return

    if (window.twttr?.widgets) {
      // Script already loaded — re-process embeds on the page
      window.twttr.widgets.load()
    } else if (!document.querySelector('script[src="https://platform.twitter.com/widgets.js"]')) {
      // Load script once — it will auto-process all .twitter-tweet elements on load
      const script = document.createElement('script')
      script.src = 'https://platform.twitter.com/widgets.js'
      script.async = true
      document.body.appendChild(script)
    }
  }, [tweetUrl])

  if (!tweetUrl) return null

  return (
    <blockquote className="twitter-tweet">
      <a href={tweetUrl} />
    </blockquote>
  )
}

export default TwitterEmbed
