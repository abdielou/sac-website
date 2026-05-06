'use client'

import { useState } from 'react'

export default function MediaPlayer({ url }) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  // Extract slug from /media/slug
  const slug = url.replace(/^\/media\//, '').replace(/\/$/, '')
  const streamUrl = `/api/media/${slug}/stream`

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-900 flex items-center justify-center">
        <p className="text-white">Error al cargar el video</p>
        <button
          onClick={() => {
            setError(false)
            setLoading(true)
          }}
          className="ml-4 px-3 py-1 text-sm text-white bg-red-600 rounded"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="w-full">
      {loading && (
        <div className="w-full aspect-video bg-gray-900 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <video
        title="Video"
        controls
        preload="metadata"
        src={streamUrl}
        className={`w-full aspect-video ${loading ? 'hidden' : ''}`}
        onCanPlay={() => setLoading(false)}
        onError={() => setError(true)}
      />
    </div>
  )
}
