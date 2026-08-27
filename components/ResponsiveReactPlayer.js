'use client'

import { useState } from 'react'
import MediaPlayer from '@/components/MediaPlayer'

const ASPECT_BOX = 'relative pb-[56.25%] h-0'
/** Shorts are 9:16, so a 16:9 box shows large black bars. */
const PORTRAIT_BOX = 'relative pb-[177.78%] h-0 max-w-[400px] mx-auto'
const FRAME = 'absolute top-0 left-0 w-full h-full'

export function getYouTubeId(url) {
  // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID,
  // youtube.com/shorts/ID, youtube.com/live/ID
  // prettier-ignore
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

export function isYouTubeShort(url) {
  return url.includes('youtube.com/shorts/')
}

export function getFacebookVideoUrl(url) {
  // facebook.com/*/videos/ID, facebook.com/watch/?v=ID, fb.watch/ID
  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`
  }
  return null
}

/** Poster served by YouTube for every public video. */
export function youTubePosterUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

/** Privacy-friendly embed host, only requested after the reader asks for it. */
export function youTubeEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`
}

/**
 * Click-to-load facade.
 *
 * 24 article pages shipped an eager YouTube iframe, each pulling 700KB to 1.2MB
 * of player bundle on the main thread while the article was still loading. The
 * facade ships a single poster image instead and mounts the real player on the
 * first click, which also plays the video, so the reader still needs one click.
 * The aspect box is unchanged, so there is no layout shift either way.
 */
const YouTubeEmbed = ({ videoId, portrait = false }) => {
  const [playing, setPlaying] = useState(false)
  const box = portrait ? PORTRAIT_BOX : ASPECT_BOX

  if (playing) {
    return (
      <div className={box}>
        <iframe
          className={FRAME}
          src={youTubeEmbedUrl(videoId)}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className={`${box} not-prose`}>
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label="Reproducir el video de YouTube"
        className={`${FRAME} group flex items-center justify-center bg-black cursor-pointer`}
      >
        {/* i.ytimg.com is not a configured next/image remote pattern, and the
            poster is already sized by YouTube, so a raw img is correct here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={youTubePosterUrl(videoId)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute top-0 left-0 object-cover w-full h-full m-0"
        />
        <span className="relative flex items-center justify-center w-16 h-16 rounded-full bg-black/60 group-hover:bg-black/80">
          <svg
            className="w-8 h-8 ml-1 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </button>
    </div>
  )
}

const ResponsiveReactPlayer = ({ url }) => {
  const youtubeId = getYouTubeId(url)

  if (youtubeId) {
    return <YouTubeEmbed videoId={youtubeId} portrait={isYouTubeShort(url)} />
  }

  const fbSrc = getFacebookVideoUrl(url)
  if (fbSrc) {
    return (
      <div className={ASPECT_BOX}>
        <iframe
          className={FRAME}
          src={fbSrc}
          title="Facebook video"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    )
  }

  // Internal media URLs
  if (url.includes('/media/')) {
    return <MediaPlayer url={url} />
  }

  // Fallback: link to the video
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  )
}

export default ResponsiveReactPlayer
