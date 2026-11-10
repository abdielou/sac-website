'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MANUAL_OBJECT_TYPES,
  parseCoordinate,
  validateManualObject,
} from '@/lib/guide-manual-object'

const FIELDS = [
  'name',
  'designation',
  'objectType',
  'constellation',
  'magnitude',
  'ra',
  'dec',
  'imageUrl',
  'imageCredit',
]

function toFormValues(manual, initialName) {
  const values = {}
  for (const field of FIELDS) {
    const value = manual?.[field]
    values[field] = value === null || value === undefined ? '' : String(value)
  }
  if (!manual && initialName) values.name = initialName
  return values
}

/**
 * Readable file name from an image URL. Drops the upload timestamp prefix,
 * so `.../1794323397181-jupiter.jpg` shows as `jupiter.jpg`.
 */
function fileNameFromUrl(url) {
  const last = String(url || '')
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .pop()
  if (!last) return ''
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    // Keep the raw segment when it is not valid URI encoding.
  }
  return name.replace(/^\d{10,}-/, '')
}

/**
 * Upload an image file for a manual guide object.
 * @param {File} file
 * @returns {Promise<string>} URL of the uploaded image
 */
async function uploadGuideImage(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/guides/upload-image', { method: 'POST', body: formData })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Error al subir imagen')
  return body.url
}

function Field({ id, label, error, hint, children }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  )
}

/**
 * ManualObjectForm - Modal form to add or edit an object that is not in the catalog.
 *
 * @param {string} objectId - The entry's `manual-<random>` id
 * @param {Object|null} initialValue - The current manual block, or null to add a new object
 * @param {string} [initialName] - Name to fill in when adding, for example the search text
 * @param {Function} onSubmit - Called with the cleaned manual block
 * @param {Function} onCancel - Called when the dialog closes without saving
 */
export default function ManualObjectForm({
  objectId,
  initialValue = null,
  initialName = '',
  onSubmit,
  onCancel,
}) {
  const isEdit = !!initialValue
  const [values, setValues] = useState(() => toFormValues(initialValue, initialName))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  // Original name of the file the editor picked, shown instead of the storage URL
  const [uploadedName, setUploadedName] = useState('')
  // True while the editor types or pastes an image link instead of uploading a file
  const [pasteMode, setPasteMode] = useState(false)
  const fileInputRef = useRef(null)

  // The browser cannot see S3_STUB_DIR, so local stub paths pass here and the API decides.
  const result = validateManualObject(objectId, values, { allowLocalImages: true })
  const errors = result.ok ? {} : result.errors
  const errorFor = (field) => (submitted || touched[field] ? errors[field] : null)

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onCancel()
    },
    [onCancel]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const setField = (field) => (e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))
  const touch = (field) => () => setTouched((prev) => ({ ...prev, [field]: true }))

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError(null)
    try {
      const url = await uploadGuideImage(file)
      setValues((prev) => ({ ...prev, imageUrl: url }))
      setUploadedName(file.name)
      setPasteMode(false)
    } catch (err) {
      setUploadError(err.message || 'Error al subir imagen')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (!result.ok || isUploading) return
    onSubmit(result.value)
  }

  const coordinateHint = (field, axis, example) => {
    const parsed = parseCoordinate(values[field], axis)
    return parsed === null ? example : `= ${parsed.toFixed(4)}°`
  }

  const inputClass =
    'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const imageUrl = values.imageUrl.trim()
  const urlInvalid = !!imageUrl && !!errors.imageUrl
  const showUrlInput = pasteMode || urlInvalid
  const hasImage = !!imageUrl && !urlInvalid && !pasteMode
  const imageName = uploadedName || fileNameFromUrl(imageUrl)

  const openFilePicker = () => fileInputRef.current?.click()

  const removeImage = () => {
    setValues((prev) => ({ ...prev, imageUrl: '' }))
    setUploadedName('')
    setUploadError(null)
  }

  // Leave paste mode once the link is valid, so the preview replaces the text field.
  const handleUrlBlur = () => {
    touch('imageUrl')()
    if (!errors.imageUrl) setPasteMode(false)
    setUploadedName('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4"
        aria-labelledby="manual-object-title"
        noValidate
      >
        <div>
          <h3
            id="manual-object-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {isEdit ? 'Editar objeto manual' : 'Agregar objeto manual'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Para objetos que no están en el catálogo: planetas, la Luna, cometas, eventos y más.
          </p>
        </div>

        <Field id="manual-name" label="Nombre *" error={errorFor('name')}>
          <input
            id="manual-name"
            type="text"
            value={values.name}
            onChange={setField('name')}
            onBlur={touch('name')}
            placeholder="Ej: Júpiter"
            className={inputClass}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="manual-designation" label="Designación" error={errorFor('designation')}>
            <input
              id="manual-designation"
              type="text"
              value={values.designation}
              onChange={setField('designation')}
              onBlur={touch('designation')}
              placeholder="Ej: C/2025 A1"
              className={inputClass}
            />
          </Field>
          <Field id="manual-type" label="Tipo" error={errorFor('objectType')}>
            <input
              id="manual-type"
              type="text"
              list="manual-type-options"
              value={values.objectType}
              onChange={setField('objectType')}
              onBlur={touch('objectType')}
              placeholder="Ej: Planeta"
              className={inputClass}
            />
            <datalist id="manual-type-options">
              {MANUAL_OBJECT_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field id="manual-constellation" label="Constelación" error={errorFor('constellation')}>
            <input
              id="manual-constellation"
              type="text"
              value={values.constellation}
              onChange={setField('constellation')}
              onBlur={touch('constellation')}
              placeholder="Ej: Leo"
              className={inputClass}
            />
          </Field>
          <Field id="manual-magnitude" label="Magnitud" error={errorFor('magnitude')}>
            <input
              id="manual-magnitude"
              type="text"
              inputMode="decimal"
              value={values.magnitude}
              onChange={setField('magnitude')}
              onBlur={touch('magnitude')}
              placeholder="Ej: -2.5"
              className={inputClass}
            />
          </Field>
          <Field
            id="manual-ra"
            label="AR (ascensión recta)"
            error={errorFor('ra')}
            hint={coordinateHint('ra', 'ra', 'Grados (150.2) u horas (10 00 48)')}
          >
            <input
              id="manual-ra"
              type="text"
              value={values.ra}
              onChange={setField('ra')}
              onBlur={touch('ra')}
              placeholder="Opcional"
              className={inputClass}
            />
          </Field>
          <Field
            id="manual-dec"
            label="Dec (declinación)"
            error={errorFor('dec')}
            hint={coordinateHint('dec', 'dec', 'Grados (12.3) o +12 18 00')}
          >
            <input
              id="manual-dec"
              type="text"
              value={values.dec}
              onChange={setField('dec')}
              onBlur={touch('dec')}
              placeholder="Opcional"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Sin imagen propia, la guía usa una imagen de SkyView si hay AR y Dec. Deja las coordenadas
          vacías para planetas, cometas y eventos.
        </p>

        <Field id="manual-image-url" label="Imagen" error={uploadError || errorFor('imageUrl')}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {hasImage ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`Vista previa de ${values.name || 'objeto'}`}
                className="w-24 h-24 rounded object-cover bg-gray-100 dark:bg-gray-900"
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-gray-900 dark:text-white truncate" title={imageName}>
                  {imageName}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={isUploading}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    {isUploading ? 'Subiendo...' : 'Cambiar imagen'}
                  </button>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Quitar imagen
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={isUploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isUploading ? 'Subiendo...' : 'Subir imagen'}
                </button>
                {!showUrlInput && (
                  <button
                    type="button"
                    onClick={() => setPasteMode(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    o pega un enlace
                  </button>
                )}
              </div>
              {showUrlInput && (
                <input
                  id="manual-image-url"
                  type="url"
                  value={values.imageUrl}
                  onChange={setField('imageUrl')}
                  onBlur={handleUrlBlur}
                  placeholder="https://..."
                  className={inputClass}
                  autoFocus
                />
              )}
            </div>
          )}
        </Field>

        <Field id="manual-image-credit" label="Crédito de imagen" error={errorFor('imageCredit')}>
          <input
            id="manual-image-credit"
            type="text"
            value={values.imageCredit}
            onChange={setField('imageCredit')}
            onBlur={touch('imageCredit')}
            placeholder="Ej: NASA/JPL-Caltech"
            className={inputClass}
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isUploading || (submitted && !result.ok)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isEdit ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  )
}
