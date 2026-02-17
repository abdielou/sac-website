'use client'

function getYouTubeId(url) {
  // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/
  )
  return match ? match[1] : null
}

function getFacebookVideoUrl(url) {
  // facebook.com/*/videos/ID, facebook.com/watch/?v=ID, fb.watch/ID
  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`
  }
  return null
}

const ResponsiveReactPlayer = ({ url }) => {
  const youtubeId = getYouTubeId(url)

  if (youtubeId) {
    return (
      <div className="relative pb-[56.25%] h-0">
        <iframe
          className="absolute top-0 left-0 w-full h-full"
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  const fbSrc = getFacebookVideoUrl(url)
  if (fbSrc) {
    return (
      <div className="relative pb-[56.25%] h-0">
        <iframe
          className="absolute top-0 left-0 w-full h-full"
          src={fbSrc}
          title="Facebook video"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    )
  }

  // Fallback: link to the video
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  )
}

export default ResponsiveReactPlayer
