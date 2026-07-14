'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  contentTypeAcceptsImages,
  contentTypeRequiresImages,
  MAX_VALIDATION_IMAGES,
  MAX_IMAGE_SIZE_BYTES,
} from '@/lib/ai-constants'
import { DEFAULT_FORM } from '@/lib/ai-validation-draft'

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

function validateImageFiles(files) {
  if (files.length > MAX_VALIDATION_IMAGES) {
    return `Máximo ${MAX_VALIDATION_IMAGES} imágenes.`
  }
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return `Cada imagen debe ser menor a ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`
    }
    if (file.type && !file.type.startsWith('image/')) {
      return 'Solo se permiten archivos de imagen.'
    }
  }
  return null
}

/**
 * @param {Object} props
 * @param {boolean} props.canValidate
 * @param {boolean} props.disabled - form locked during submit/poll
 * @param {Object} props.formState
 * @param {Function} props.onFormChange
 * @param {File[]} props.images
 * @param {Function} props.onImagesChange
 * @param {Function} props.onSubmit
 * @param {string} [props.fieldError]
 * @param {{ id: string, label: string }[]} [props.platforms] - from active guidelines
 */
export default function ValidationForm({
  canValidate,
  disabled = false,
  formState,
  onFormChange,
  images = [],
  onImagesChange,
  onSubmit,
  fieldError,
  platforms = [],
}) {
  const fileInputRef = useRef(null)
  const [localImageError, setLocalImageError] = useState(null)

  const showImages = contentTypeAcceptsImages(formState.platform, formState.contentType)
  const requiresImages = contentTypeRequiresImages(formState.platform, formState.contentType)
  const showEventFields = formState.contentType === 'event_promotion'

  useEffect(() => {
    if (!platforms.length) return
    const ids = platforms.map((p) => p.id)
    if (ids.includes(formState.platform)) return
    onFormChange({ ...formState, platform: ids[0] })
    // Only re-sync when the available platform list or current selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [platforms, formState.platform])

  const handleChange = (field) => (e) => {
    onFormChange({ ...formState, [field]: e.target.value })
  }

  const handleImageSelect = useCallback(
    (e) => {
      const selected = Array.from(e.target.files || [])
      const err = validateImageFiles(selected)
      setLocalImageError(err)
      if (!err) {
        onImagesChange(selected)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [onImagesChange]
  )

  const removeImage = (index) => {
    onImagesChange(images.filter((_, i) => i !== index))
    setLocalImageError(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canValidate || disabled) return
    if (requiresImages && images.length === 0) {
      setLocalImageError('Se requiere al menos una imagen para esta plataforma y tipo de contenido.')
      return
    }
    setLocalImageError(null)
    onSubmit()
  }

  const formDisabled = disabled || !canValidate

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="validation-form">
      {!canValidate && (
        <p className="text-sm text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          Tienes acceso de solo lectura. Se requiere permiso{' '}
          <code className="text-xs">write_ai</code> para iniciar validaciones.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ai-platform" className={labelClass}>
            Plataforma
          </label>
          <select
            id="ai-platform"
            value={formState.platform}
            onChange={handleChange('platform')}
            disabled={formDisabled}
            className={inputClass}
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ai-content-type" className={labelClass}>
            Tipo de contenido
          </label>
          <select
            id="ai-content-type"
            value={formState.contentType}
            onChange={handleChange('contentType')}
            disabled={formDisabled}
            className={inputClass}
          >
            {CONTENT_TYPES.map((ct) => (
              <option key={ct} value={ct}>
                {CONTENT_TYPE_LABELS[ct]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Media-first when images apply (Instagram compose flow: media → caption). */}
      {showImages && (
        <div>
          <label className={labelClass}>
            Imágenes{' '}
            {requiresImages ? (
              <>
                <span className="text-red-500">*</span>
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  {' '}
                  (obligatoria, máx. {MAX_VALIDATION_IMAGES})
                </span>
              </>
            ) : (
              <span className="font-normal text-gray-500 dark:text-gray-400">
                (opcional, máx. {MAX_VALIDATION_IMAGES})
              </span>
            )}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={formDisabled}
            onChange={handleImageSelect}
            className="block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 disabled:opacity-60"
          />
          {(localImageError || fieldError) && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {localImageError || fieldError}
            </p>
          )}
          {images.length > 0 && (
            <ul className="mt-2 space-y-1">
              {images.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    disabled={formDisabled}
                    onClick={() => removeImage(idx)}
                    className="text-red-600 dark:text-red-400 hover:underline ml-2 shrink-0"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ai-draft-text" className={labelClass}>
          {showImages ? 'Pie de foto / texto' : 'Borrador'}{' '}
          <span className="text-red-500">*</span>
        </label>
        <textarea
          id="ai-draft-text"
          value={formState.draftText}
          onChange={handleChange('draftText')}
          disabled={formDisabled}
          rows={8}
          required
          placeholder={
            showImages
              ? 'Escribe el pie de foto o caption de la publicación...'
              : 'Pega o escribe el texto de la publicación...'
          }
          className={inputClass}
        />
      </div>

      <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          Campos opcionales
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="ai-goal" className={labelClass}>
              Objetivo
            </label>
            <input
              id="ai-goal"
              type="text"
              value={formState.goal}
              onChange={handleChange('goal')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ai-audience" className={labelClass}>
              Audiencia
            </label>
            <input
              id="ai-audience"
              type="text"
              value={formState.audience}
              onChange={handleChange('audience')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ai-cta" className={labelClass}>
              Llamado a la acción (CTA)
            </label>
            <input
              id="ai-cta"
              type="text"
              value={formState.cta}
              onChange={handleChange('cta')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ai-hashtags" className={labelClass}>
              Hashtags (separados por coma)
            </label>
            <input
              id="ai-hashtags"
              type="text"
              value={formState.hashtags}
              onChange={handleChange('hashtags')}
              disabled={formDisabled}
              placeholder="#astronomia, #SAC"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ai-alt-text" className={labelClass}>
              Texto alternativo (alt text)
            </label>
            <input
              id="ai-alt-text"
              type="text"
              value={formState.altText}
              onChange={handleChange('altText')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>

          {showEventFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="sm:col-span-2">
                <label htmlFor="ai-event-name" className={labelClass}>
                  Nombre del evento
                </label>
                <input
                  id="ai-event-name"
                  type="text"
                  value={formState.eventName}
                  onChange={handleChange('eventName')}
                  disabled={formDisabled}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ai-event-date" className={labelClass}>
                  Fecha
                </label>
                <input
                  id="ai-event-date"
                  type="text"
                  value={formState.eventDate}
                  onChange={handleChange('eventDate')}
                  disabled={formDisabled}
                  placeholder="ej. 15 de agosto"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ai-event-time" className={labelClass}>
                  Hora
                </label>
                <input
                  id="ai-event-time"
                  type="text"
                  value={formState.eventTime}
                  onChange={handleChange('eventTime')}
                  disabled={formDisabled}
                  placeholder="ej. 7:00 PM"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ai-event-location" className={labelClass}>
                  Lugar
                </label>
                <input
                  id="ai-event-location"
                  type="text"
                  value={formState.eventLocation}
                  onChange={handleChange('eventLocation')}
                  disabled={formDisabled}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      </details>

      {canValidate && (
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={formDisabled || !formState.draftText.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {disabled && (
              <svg
                className="animate-spin w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
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
            {disabled ? 'Validando...' : 'Validar borrador'}
          </button>
        </div>
      )}
    </form>
  )
}

export { DEFAULT_FORM }
