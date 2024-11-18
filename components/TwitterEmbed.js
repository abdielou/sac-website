import { useEffect } from 'react'

const TwitterEmbed = ({ tweetId }) => {
  useEffect(() => {
    // Remove any existing Twitter script
    const existingScript = document.querySelector(
      'script[src="https://platform.twitter.com/widgets.js"]'
    )
    if (existingScript) {
      existingScript.remove()
    }

    // Add new Twitter script
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      // Cleanup on unmount
      script.remove()
    }
  }, [tweetId])

  return (
    <blockquote className="twitter-tweet">
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a href={`https://twitter.com/Soc_AstroCaribe/status/${tweetId}`} />
    </blockquote>
  )
}

export default TwitterEmbed
