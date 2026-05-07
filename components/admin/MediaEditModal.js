'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { slugifyMediaName } from '@/lib/media-slug'

const inputClasses =
  'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const POSTER_MAX_WIDTH = 640
const POSTER_MAX_HEIGHT = 360
const POSTER_QUALITY = 0.82
const POSTER_MAX_INPUT_SIZE = 25 * 1024 * 1024

function resizePosterFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const scale = Math.min(
        1,
        POSTER_MAX_WIDTH / image.naturalWidth,
        POSTER_MAX_HEIGHT / image.naturalHeight
      )
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen'))
        return
      }

      ctx.drawImage(image, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No se pudo procesar la imagen'))
            return
          }
          resolve(new File([blob], 'poster.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        POSTER_QUALITY
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('No se pudo leer la imagen'))
    }

    image.src = objectUrl
  })
}

/**
 * MediaEditModal - Modal dialog for editing media entry metadata.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {object} props.media - Current media entry { slug, title, description }
 * @param {(data: { slug: string, title: string, description: string, thumbnail?: string }) => void} props.onSave - Called with updated data on save
 */
export default function MediaEditModal({ isOpen, onClose, media, onSave }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [filename, setFilename] = useState('')
  const [posterPick, setPosterPick] = useState(null)
  const [posterError, setPosterError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [posterGenBusy, setPosterGenBusy] = useState(false)

  useEffect(() => {
    if (!isOpen || !media) return
    setTitle(media.title || '')
    setDescription(media.description || '')
    setFilename(media.slug || '')
    setPosterPick((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setPosterError('')
    setIsSaving(false)
    setPosterGenBusy(false)
  }, [isOpen, media])

  const sanitizedFilename = useMemo(() => slugifyMediaName(filename), [filename])
  const slugChanged = Boolean(
    media?.slug && sanitizedFilename && sanitizedFilename !== media.slug
  )
  const filenameInvalid = Boolean(filename.trim()) && !sanitizedFilename

  useEffect(() => {
    return () => {
      setPosterPick((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return null
      })
    }
  }, [])

  const handlePosterInput = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    setPosterError('')
    if (!f || !f.type.startsWith('image/')) return
    if (f.size > POSTER_MAX_INPUT_SIZE) {
      setPosterError('La imagen no puede pesar mas de 25MB')
      return
    }

    try {
      const resized = await resizePosterFile(f)
      setPosterPick((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { file: resized, previewUrl: URL.createObjectURL(resized) }
      })
    } catch (err) {
      setPosterError(err.message || 'No se pudo procesar la imagen')
    }
  }

  const handleFfmpegPoster = async () => {
    if (!media?.slug) return
    setPosterGenBusy(true)
    setPosterError('')
    try {
      const res = await fetch('/api/admin/media/generate-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ slug: media.slug, force: Boolean(media.thumbnail) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || body.details || `Error ${res.status}`)
      }
      if (body.entry) {
        window.dispatchEvent(
          new CustomEvent('media-poster-ready', { detail: { media: body.entry } })
        )
      }
    } catch (err) {
      setPosterError(err.message || 'Error al generar miniatura')
    } finally {
      setPosterGenBusy(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    if (filenameInvalid) {
      setPosterError('El nombre de archivo no es valido')
      return
    }

    const pick = posterPick
    setIsSaving(true)
    setPosterError('')
    try {
      let thumbnail
      if (pick?.file) {
        const formData = new FormData()
        formData.append('file', pick.file)
        const res = await fetch('/api/admin/media/poster', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body.error || 'No se pudo subir imagen miniatura')
        }
        thumbnail = body.url
      }

      await onSave({
        slug: media.slug,
        title: title.trim(),
        description: description.trim(),
        ...(thumbnail ? { thumbnail } : {}),
        ...(slugChanged ? { newSlug: sanitizedFilename } : {}),
      })

      if (pick?.previewUrl) {
        URL.revokeObjectURL(pick.previewUrl)
        setPosterPick(null)
      }
    } catch (err) {
      setPosterError(err.message || 'Error')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Editar Video</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Thumbnail preview */}
            {(posterPick?.previewUrl || media.thumbnail) && (
              <div className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                <img
                  src={posterPick?.previewUrl || media.thumbnail}
                  alt=""
                  className="w-full max-h-40 object-contain"
                />
              </div>
            )}

            {posterError && <p className="text-sm text-red-600 dark:text-red-400">{posterError}</p>}

            <div>
              <label className={labelClasses}>Miniatura en la lista (opcional)</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                JPEG/PNG/WebP. Se reduce automaticamente a 640x360 antes de subir.
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePosterInput}
                className={`${inputClasses} py-2 text-xs file:mr-3 file:text-sm`}
              />
              <button
                type="button"
                onClick={() => void handleFfmpegPoster()}
                disabled={posterGenBusy}
                title="Requiere FFmpeg en PATH o variable FFMPEG_PATH en la maquina que corre esta app."
                className="mt-3 w-full px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {posterGenBusy
                  ? 'Generando fotograma...'
                  : media.thumbnail
                    ? 'Volver a generar miniatura (FFmpeg)'
                    : 'Generar miniatura desde video (FFmpeg)'}
              </button>
            </div>

            {/* Title */}
            <div>
              <label className={labelClasses}>Titulo</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClasses}
                placeholder="Titulo del video"
                maxLength={200}
              />
            </div>

            {/* Filename / permalink */}
            <div>
              <label className={labelClasses}>Nombre de archivo (enlace permanente)</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Define la URL publica: <code>/media/{sanitizedFilename || media?.slug}</code>
              </p>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className={inputClasses}
                placeholder="nombre-del-archivo"
                maxLength={120}
              />
              {filenameInvalid && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  El nombre debe contener letras, numeros o guiones.
                </p>
              )}
              {slugChanged && (
                <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>Aviso:</strong> al guardar, el enlace antiguo dejara de funcionar.
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className={labelClasses}>Descripcion</label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClasses}
                placeholder="Descripcion opcional del video"
                maxLength={1000}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 text-right">
                {description.length}/1000
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim() || filenameInvalid}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isSaving && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
              )}
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
