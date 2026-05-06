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
 * and action buttons: Edit, Copiar link, Eliminar.
 *
 * @param {object} props
 * @param {object} props.media - Media entry { slug, title, description, thumbnail, publishedAt, s3Key }
 * @param {boolean} [props.canManage] - Whether the user can edit/delete (defaults to true for backward compat)
 * @param {() => void} props.onEdit - Called when Edit is clicked
 * @param {() => void} props.onDelete - Called when Eliminar is clicked
 */
export default function MediaCard({ media, canManage = true, onEdit, onDelete }) {
  const [copyLabel, setCopyLabel] = useState('Copiar link')

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}/media/${media.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyLabel('Copiado')
      setTimeout(() => setCopyLabel('Copiar link'), 2000)
    } catch {
      setCopyLabel('Error')
      setTimeout(() => setCopyLabel('Copiar link'), 2000)
    }
  }, [media.slug])

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
      <div className="px-4 pb-4 flex gap-2">
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
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
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
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
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-4V5a2 2 0 10-4 0v1h4z"
              />
            </svg>
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}
