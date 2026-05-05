'use client'

import { useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Generate a client-side thumbnail preview URL for an image file.
 * @param {File} file
 * @returns {string} Object URL for the thumbnail
 */
function createThumbnailPreview(file) {
  return URL.createObjectURL(file)
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
  accept = 'image/*',
  onUpload,
}) {
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)
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
      setIsUploading(true)
      setProgress(0)

      try {
        let s3Key

        if (onUpload) {
          s3Key = await onUpload(file)
        } else {
          // Upload via fetch
          const formData = new FormData()
          formData.append('file', file)

          const xhr = new XMLHttpRequest()
          await new Promise((resolve, reject) => {
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                setProgress(Math.round((e.loaded / e.total) * 100))
              }
            })
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText)
                  s3Key = data.s3Key || data.key || data.url
                  resolve()
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
            xhr.send(formData)
          })
        }

        // Build media entry (title from filename)
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
        const slug = title
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()

        // Generate thumbnail from preview if image
        const thumbnail = preview || null

        const mediaEntry = {
          slug,
          title,
          description: '',
          thumbnail,
          s3Key: s3Key || file.name,
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
    [uploadUrl, onUpload, preview]
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
                Arrastra una imagen aqui
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                o haz clic para seleccionar
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
    </>
  )
}
