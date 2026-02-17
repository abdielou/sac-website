'use client'

import { useRef, useCallback, useState } from 'react'
import { insertAtCursor } from '@/components/admin/ArticleEditor'

/**
 * Upload an image file to the article image S3 bucket.
 * Returns the public URL on success.
 *
 * @param {File} file - Image file to upload
 * @returns {Promise<string>} URL of uploaded image
 */
export async function uploadImage(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/articles/upload-image', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Error al subir imagen')
  }
  const { url } = await res.json()
  return url
}

/**
 * ImageUploadButton - Toolbar button for uploading images into the editor
 *
 * Opens a file picker, uploads to S3, and inserts markdown image syntax
 * at the current cursor position.
 *
 * @param {object} props
 * @param {React.RefObject} props.editorRef - Ref to the CodeMirror EditorView
 */
export default function ImageUploadButton({ editorRef }) {
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      setIsUploading(true)
      try {
        const url = await uploadImage(file)
        insertAtCursor(editorRef?.current, `![](${url})\n`)
      } catch (err) {
        alert(err.message || 'Error al subir imagen')
      } finally {
        setIsUploading(false)
        e.target.value = ''
      }
    },
    [editorRef]
  )

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isUploading}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
        title={isUploading ? 'Subiendo...' : 'Insertar imagen'}
      >
        {isUploading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  )
}
