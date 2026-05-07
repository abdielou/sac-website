'use client'

import { useCallback, useState } from 'react'

/**
 * Format a date string to locale date.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('es-PR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * MediaCard - Card component displaying a media item with thumbnail, title, date,
 * and action buttons (short labels so they fit narrow cards).
 *
 * @param {object} props
 * @param {object} props.media - Media entry { slug, title, description, thumbnail, publishedAt, s3Key }
 * @param {boolean} [props.canManage] - Whether the user can edit/delete (defaults to true for backward compat)
 * @param {() => void} props.onEdit - Called when Editar is clicked
 * @param {() => void} props.onDelete - Called when Borrar is clicked
 */
export default function MediaCard({ media, canManage = true, onEdit, onDelete }) {
  const [copyLabel, setCopyLabel] = useState('Copiar')

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/media/${media.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyLabel('Listo')
      setTimeout(() => setCopyLabel('Copiar'), 2000)
    } catch {
      setCopyLabel('Error')
      setTimeout(() => setCopyLabel('Copiar'), 2000)
    }
  }, [media.slug])

  const actionBtn =
    'flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-700 overflow-hidden">
        {media.thumbnail ? (
          <img src={media.thumbnail} alt={media.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-gray-300 dark:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
          {media.title}
        </h3>
        {media.publishedAt && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(media.publishedAt)}
          </p>
        )}
        {media.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
            {media.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-1.5">
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar: ${media.title}`}
            className={`${actionBtn} text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Editar
          </button>
        )}

        <button
          type="button"
          onClick={handleCopyLink}
          title="Copiar enlace público del video"
          aria-label="Copiar enlace público"
          className={`${actionBtn} text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
          {copyLabel}
        </button>

        {canManage && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Eliminar: ${media.title}`}
            className={`${actionBtn} text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-4V5a2 2 0 10-4 0v1h4z"
              />
            </svg>
            Borrar
          </button>
        )}
      </div>
    </div>
  )
}
