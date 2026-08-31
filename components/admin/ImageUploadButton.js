'use client'

import { useRef, useCallback, useState } from 'react'
import { insertAtCursor } from '@/components/admin/ArticleEditor'

/**
 * Get natural width and height of an image File object.
 * @param {File} file
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(objectUrl)
    }
    img.onerror = () => {
      resolve({ width: 800, height: 600 })
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
  })
}

/** Alt text below this length describes nothing useful. */
export const ALT_MIN_LENGTH = 15

/**
 * Trim and collapse every run of whitespace to a single space.
 * @param {string} value
 * @returns {string}
 */
export function collapseWhitespace(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

/**
 * Turn a file name into the words it contains, e.g. `pano_1.jpg` to `pano 1`.
 * Used only to detect alt text that is still the file name.
 *
 * @param {string} name
 * @returns {string}
 */
export function fileNameToText(name) {
  return collapseWhitespace(
    String(name || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
  )
}

/**
 * Classify alt text so the editor sees why it is not good enough.
 *
 * The corpus median alt is 25 characters and the worst entries are `pano1`,
 * `63718` and `LRO`, all of them file names that were seeded automatically and
 * never edited. Alt text is now typed by hand, and this check flags the two
 * failure modes that produced those values.
 *
 * @param {string} alt - Alt text as typed
 * @param {string} fileName - Name of the uploaded file
 * @returns {{count: number, status: string}} status is 'empty', 'filename',
 *          'short' or 'ok'
 */
export function classifyAltText(alt, fileName) {
  const clean = collapseWhitespace(alt)
  if (!clean) return { count: 0, status: 'empty' }

  const lower = clean.toLowerCase()
  const raw = collapseWhitespace(fileName).toLowerCase()
  if (raw && (lower === raw || lower === fileNameToText(fileName).toLowerCase())) {
    return { count: clean.length, status: 'filename' }
  }

  return { count: clean.length, status: clean.length < ALT_MIN_LENGTH ? 'short' : 'ok' }
}

/**
 * Build the MDX <Image> snippet for insertion, with an optional caption.
 *
 * Alt text and caption are separate values. They used to be one string, so an
 * editor who rewrote the caption left the alt as the file name.
 *
 * @param {string} url - S3 public URL
 * @param {number} width
 * @param {number} height
 * @param {string} altText
 * @param {string} [caption] - Omit to reuse altText, pass '' for no caption
 * @returns {string}
 */
export function buildImageSnippet(url, width, height, altText, caption) {
  const alt = String(altText ?? '').replace(/"/g, '&quot;')
  const text = caption === undefined ? String(altText ?? '') : String(caption)
  const image = `<Image\n  src="${url}"\n  alt="${alt}"\n  width={${width}}\n  height={${height}}\n/>\n`

  return text ? `${image}<ImageCaption>${text}</ImageCaption>\n` : image
}

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

const ALT_HINTS = {
  empty: 'El texto alternativo es obligatorio. Describe lo que se ve en la imagen.',
  filename: 'Esto sigue siendo el nombre del archivo. Describe lo que se ve en la imagen.',
  short: `Texto muy corto. Usa al menos ${ALT_MIN_LENGTH} caracteres, por ejemplo "Luna llena sobre el Observatorio de Arecibo".`,
  ok: '',
}

const ALT_TONE = {
  empty: 'text-gray-500 dark:text-gray-400',
  filename: 'text-red-600 dark:text-red-400',
  short: 'text-yellow-600 dark:text-yellow-400',
  ok: 'text-green-600 dark:text-green-400',
}

/**
 * ImageUploadButton - Toolbar button for uploading images into the editor
 *
 * Opens a file picker and uploads to S3. The editor then types the alt text and
 * an optional caption before the MDX snippet is inserted at the cursor.
 *
 * @param {object} props
 * @param {React.RefObject} props.editorRef - Ref to the CodeMirror EditorView
 */
export default function ImageUploadButton({ editorRef }) {
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  // Uploaded image waiting for its alt text: { url, width, height, fileName }
  const [pending, setPending] = useState(null)
  const [altText, setAltText] = useState('')
  const [caption, setCaption] = useState('')

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const [url, { width, height }] = await Promise.all([
        uploadImage(file),
        getImageDimensions(file),
      ])
      // Alt text is never seeded from the file name. The editor writes it.
      setAltText('')
      setCaption('')
      setPending({ url, width, height, fileName: file.name })
    } catch (err) {
      alert(err.message || 'Error al subir imagen')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }, [])

  const closeDialog = useCallback(() => {
    setPending(null)
    setAltText('')
    setCaption('')
  }, [])

  const handleInsert = useCallback(() => {
    if (!pending) return

    insertAtCursor(
      editorRef?.current,
      buildImageSnippet(
        pending.url,
        pending.width,
        pending.height,
        collapseWhitespace(altText),
        collapseWhitespace(caption)
      )
    )
    closeDialog()
  }, [pending, altText, caption, editorRef, closeDialog])

  const alt = classifyAltText(altText, pending?.fileName)
  const dialogInputClass =
    'w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

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

      {/* Alt text dialog - shown after the upload succeeds */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Describe la imagen
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              El texto alternativo lo leen los lectores de pantalla y los buscadores.
            </p>

            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-1">
                <label
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor="image-alt-text"
                >
                  Texto alternativo
                </label>
                <span className={`text-xs tabular-nums ${ALT_TONE[alt.status]}`}>
                  {alt.count}/{ALT_MIN_LENGTH}
                </span>
              </div>
              <input
                id="image-alt-text"
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Que se ve en la imagen"
                className={dialogInputClass}
                autoFocus
              />
              {ALT_HINTS[alt.status] && (
                <p className={`mt-1 text-xs ${ALT_TONE[alt.status]}`}>{ALT_HINTS[alt.status]}</p>
              )}
            </div>

            <div className="mb-6">
              <label
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                htmlFor="image-caption"
              >
                Pie de foto (opcional)
              </label>
              <input
                id="image-caption"
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Credito o contexto visible bajo la imagen"
                className={dialogInputClass}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInsert}
                disabled={alt.status === 'empty'}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Insertar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
