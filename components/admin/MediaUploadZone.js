'use client'

import { useRef, useCallback, useState } from 'react'
/**
 * Generate a client-side thumbnail preview URL for an image file.
 * @param {File} file
 * @returns {string} Object URL for the thumbnail
 */
function createThumbnailPreview(file) {
  return URL.createObjectURL(file)
}

/**
 * Grab a JPEG thumbnail from early in the timeline (polling + decode fallbacks).
 */
function captureVideoPosterAsBlob(file, maxWidth = 640, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file?.type?.startsWith('video/') || typeof document === 'undefined') {
      resolve(null)
      return
    }

    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.preload = 'metadata'
    video.src = url

    let settled = false
    let pollTimerId = null
    let fallbackSeekTimerId = null
    let playKickTimerId = null
    let drawing = false

    const settle = (blob) => {
      if (settled) return
      settled = true
      window.clearTimeout(failTimerId)
      if (pollTimerId != null) window.clearInterval(pollTimerId)
      if (fallbackSeekTimerId != null) window.clearTimeout(fallbackSeekTimerId)
      if (playKickTimerId != null) window.clearTimeout(playKickTimerId)
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
      resolve(blob)
    }

    const failTimerId = window.setTimeout(() => settle(null), 25000)

    const finishWithCanvas = (canvas) => {
      if (settled || !canvas) return
      canvas.toBlob(
        (blob) => {
          if (settled || !blob) return
          settle(blob)
        },
        'image/jpeg',
        quality
      )
    }

    const drawPoster = async () => {
      if (settled || drawing) return
      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!vw || !vh) return

        drawing = true
        const scale = Math.min(1, maxWidth / vw)
        const cw = Math.round(vw * scale)
        const ch = Math.round(vh * scale)

        try {
          if (typeof createImageBitmap === 'function') {
            const bmp = await createImageBitmap(video)
            try {
              const canvas = document.createElement('canvas')
              canvas.width = cw
              canvas.height = ch
              const ctx = canvas.getContext('2d')
              if (!ctx) return
              ctx.drawImage(bmp, 0, 0, cw, ch)
              finishWithCanvas(canvas)
              return
            } finally {
              bmp.close()
            }
          }
        } catch {
          /* fall through to drawImage(video) */
        }

        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0, cw, ch)
        finishWithCanvas(canvas)
      } catch {
        /* keep polling until timeout */
      } finally {
        drawing = false
      }
    }

    video.onerror = () => settle(null)

    video.onloadedmetadata = () => {
      const d = video.duration
      let t = 0
      if (Number.isFinite(d) && d > 0) {
        t = Math.min(1, Math.max(d * 0.05, 0.02))
      }

      pollTimerId = window.setInterval(() => {
        void drawPoster()
      }, 120)

      const kickDecode = () => {
        try {
          const p = video.play()
          if (p !== undefined && typeof p.then === 'function') {
            p.then(() => {
              try {
                video.pause()
              } catch {}
              void drawPoster()
            }).catch(() => {})
          }
        } catch {
          /* noop */
        }
      }

      try {
        video.currentTime = t
      } catch {}

      video.addEventListener('seeked', () => void drawPoster(), { once: true })
      video.addEventListener('loadeddata', () => void drawPoster(), { once: true })

      fallbackSeekTimerId = window.setTimeout(() => {
        if (settled) return
        try {
          if (video.currentTime > 0.01) {
            video.currentTime = 0
          }
        } catch {}
      }, 700)

      playKickTimerId = window.setTimeout(() => {
        if (settled) return
        kickDecode()
      }, 950)
    }
  })
}

/**
 * @returns {Promise<{ url: string | null, failure: 'capture' | 'upload' | null }>}
 */
async function posterUrlIfVideo(file) {
  if (!file?.type?.startsWith('video/')) {
    return { url: null, failure: null }
  }
  const blob = await captureVideoPosterAsBlob(file)
  if (!blob) {
    return { url: null, failure: 'capture' }
  }
  const upload = await uploadMediaPoster(blob)
  if (!upload.url) {
    return { url: null, failure: 'upload' }
  }
  return { url: upload.url, failure: null }
}

async function uploadMediaPoster(blob) {
  const mime =
    blob && typeof blob.type === 'string' && blob.type.startsWith('image/')
      ? blob.type
      : 'image/jpeg'
  const formData = new FormData()
  formData.append('file', new File([blob], 'poster.jpg', { type: mime }))
  const res = await fetch('/api/admin/media/poster', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    return { url: null }
  }
  const data = await res.json().catch(() => ({}))
  return { url: data.url || null }
}

/**
 * MediaUploadZone - Drag-and-drop file upload zone with client-side thumbnail generation.
 *
 * dispatches 'media-uploaded' event on window with { media: { slug, title, description, thumbnail, s3Key } }
 *
 * @param {object} props
 * @param {string} [props.uploadUrl='/api/admin/media/upload'] - Upload endpoint
 * @param {string} [props.accept='image/*'] - Accepted file MIME types
 * @param {(file: File) => Promise<string>} [props.onUpload] - Optional custom upload handler; returns s3Key
 */
export default function MediaUploadZone({
  uploadUrl = '/api/admin/media/upload',
  accept = 'video/*,image/*',
  onUpload,
}) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)
  const [posterHint, setPosterHint] = useState(null)
  const [preview, setPreview] = useState(null)
  const [progress, setProgress] = useState(0)

  const processFile = useCallback((file) => {
    if (!file) return

    // Generate client-side thumbnail preview
    if (file.type.startsWith('image/')) {
      const url = createThumbnailPreview(file)
      setPreview(url)
    } else {
      setPreview(null)
    }

    return file
  }, [])

  const handleFile = useCallback(
    async (file) => {
      setError(null)
      setPosterHint(null)
      setIsUploading(true)
      setProgress(0)

      const thumbnailPromise = posterUrlIfVideo(file)

      try {
        let s3Key

        if (onUpload) {
          s3Key = await onUpload(file)
        } else {
          const formData = new FormData()
          formData.append('file', file)

          const xhr = new XMLHttpRequest()
          s3Key = await new Promise((resolve, reject) => {
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                setProgress(Math.round((e.loaded / e.total) * 100))
              }
            })
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText)
                  resolve(data.s3Key || data.key || data.url)
                } catch {
                  reject(new Error('Respuesta invalida del servidor'))
                }
              } else {
                try {
                  const data = JSON.parse(xhr.responseText)
                  reject(new Error(data.error || `Error ${xhr.status}`))
                } catch {
                  reject(new Error(`Error ${xhr.status}`))
                }
              }
            })
            xhr.addEventListener('error', () => reject(new Error('Error de red')))
            xhr.open('POST', uploadUrl)
            xhr.withCredentials = true
            xhr.send(formData)
          })
        }

        const { url: thumbnailUrl } = await thumbnailPromise

        // Build title from filename (used for creation)
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')

        // Create the persistent media entry on the server so it survives page reload
        let mediaEntry
        let createdOnServer = false
        try {
          const createRes = await fetch('/api/admin/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              title,
              s3Key: s3Key || file.name,
              description: '',
              thumbnail: thumbnailUrl,
            }),
          })

          if (createRes.ok) {
            createdOnServer = true
            const data = await createRes.json()
            mediaEntry = data.entry
          } else {
            // Fallback to local entry if creation fails (keeps optimistic behavior)
            const slug = title
              .toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-')
              .trim()
            mediaEntry = {
              slug,
              title,
              description: '',
              thumbnail: thumbnailUrl,
              s3Key: s3Key || file.name,
            }
          }
        } catch {
          // Network error fallback
          const slug = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim()
          mediaEntry = {
            slug,
            title,
            description: '',
            thumbnail: thumbnailUrl,
            s3Key: s3Key || file.name,
          }
        }

        if (
          createdOnServer &&
          file.type.startsWith('video/') &&
          mediaEntry?.slug &&
          !mediaEntry.thumbnail
        ) {
          try {
            const genRes = await fetch('/api/admin/media/generate-poster', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ slug: mediaEntry.slug }),
            })
            if (genRes.ok) {
              const data = await genRes.json()
              if (data.entry) {
                mediaEntry = data.entry
              }
            }
          } catch {
            /* ignore */
          }
        }

        setPosterHint(null)
        if (file.type.startsWith('video/') && !mediaEntry.thumbnail) {
          setPosterHint('No se genero miniatura. Sube una imagen en «Editar».')
        }

        window.dispatchEvent(new CustomEvent('media-uploaded', { detail: { media: mediaEntry } }))
      } catch (err) {
        setError(err.message || 'Error al subir archivo')
      } finally {
        setIsUploading(false)
        setPreview(null)
        setProgress(0)
      }
    },
    [uploadUrl, onUpload]
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragOver(false)
      setError(null)

      const file = e.dataTransfer.files?.[0]
      if (!file) return

      const processed = processFile(file)
      if (processed) {
        handleFile(processed)
      }
    },
    [processFile, handleFile]
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const processed = processFile(file)
      if (processed) {
        handleFile(processed)
      }
      e.target.value = ''
    },
    [processFile, handleFile]
  )

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnter={handleDragEnter}
        className={`
          relative flex flex-col items-center justify-center
          border-2 border-dashed rounded-xl cursor-pointer
          transition-colors select-none
          ${
            isDragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }
          ${isUploading ? 'pointer-events-none opacity-70' : ''}
        `}
        style={{ minHeight: 160 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <svg className="w-8 h-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-400">Subiendo...</span>
            {progress > 0 && (
              <div className="w-48 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        ) : preview ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <img
              src={preview}
              alt="Vista previa"
              className="max-h-24 max-w-full rounded-lg object-contain"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">Suelta para subir</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <svg
              className="w-8 h-8 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Arrastra un video aqui
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Si falta vista previa, el servidor usa{' '}
                <span className="text-gray-700 dark:text-gray-300">FFmpeg</span> (cuando existe en
                PATH). Recomendado: MP4 con H.264.
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-red-600 dark:text-red-400 px-4">
            {error}
          </p>
        )}
      </div>
      {posterHint && (
        <p className="text-xs text-amber-800 dark:text-amber-200/90 mt-2 px-1">{posterHint}</p>
      )}
    </>
  )
}
