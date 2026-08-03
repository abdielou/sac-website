'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  contentTypeAcceptsImages,
  contentTypeRequiresImages,
  getCanonicalEventName,
  isEventContentType,
  MAX_VALIDATION_IMAGES,
} from '@/lib/ai-constants'
import { DEFAULT_FORM } from '@/lib/ai-validation-draft'
import { mergeValidationImages } from '@/lib/ai-validation-images'
import {
  SPONSOR_MAX_BYTES,
  isAllowedSponsorMimeType,
  validateSponsorLogo,
} from '@/lib/social-template/eventFormHelpers'
import ContentTypeFields, {
  formStateKeyForContentField,
} from '@/components/admin/ai/ContentTypeFields'

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

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
 * @param {{ id: string, label: string }[]} [props.contentTypes] - from active guidelines
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
  contentTypes = [],
}) {
  const fileInputRef = useRef(null)
  const sponsorFileInputRef = useRef(null)
  const [localImageError, setLocalImageError] = useState(null)
  const [sponsorError, setSponsorError] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewUrls, setPreviewUrls] = useState([])
  const [showFieldErrors, setShowFieldErrors] = useState(false)

  const contentTypeDefinition = contentTypes.find(
    ({ id }) => id === formState.contentType
  )?.definition
  const showImages = contentTypeAcceptsImages(
    formState.platform,
    formState.contentType,
    contentTypeDefinition
  )
  const requiresImages = contentTypeRequiresImages(
    formState.platform,
    formState.contentType,
    contentTypeDefinition
  )
  const showEventFields = isEventContentType(formState.contentType, contentTypeDefinition)
  const canonicalEventName = getCanonicalEventName(formState.contentType, contentTypeDefinition)
  const formDisabled = disabled || !canValidate
  const canAddMore = images.length < MAX_VALIDATION_IMAGES
  const sponsorField = contentTypeDefinition?.fields?.find(({ key }) => key === 'sponsor')
  const supportsSponsor =
    showImages && contentTypeDefinition?.visual?.sponsorAllowed === true && Boolean(sponsorField)
  const dynamicFieldErrors = Object.fromEntries(
    (contentTypeDefinition?.fields || [])
      .filter(({ required }) => required)
      .map((field) => {
        if (field.key === 'sponsor') {
          return [
            field.key,
            !supportsSponsor || formState.sponsorLogo?.dataUrl
              ? null
              : `${field.label || 'El auspiciador'} es obligatorio`,
          ]
        }
        const stateKey = formStateKeyForContentField(field.key, contentTypeDefinition)
        return [
          field.key,
          stateKey && String(formState[stateKey] || '').trim()
            ? null
            : `${field.label || 'Este campo'} es obligatorio`,
        ]
      })
  )
  const hasDynamicFieldErrors = Object.values(dynamicFieldErrors).some(Boolean)

  useEffect(() => {
    if (!platforms.length) return
    const ids = platforms.map((p) => p.id)
    if (ids.includes(formState.platform)) return
    onFormChange({ ...formState, platform: ids[0] })
    // Only re-sync when the available platform list or current selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [platforms, formState.platform])

  useEffect(() => {
    if (!contentTypes.length) return
    const ids = contentTypes.map((ct) => ct.id)
    if (ids.includes(formState.contentType)) return
    onFormChange({ ...formState, contentType: ids[0] })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [contentTypes, formState.contentType])

  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [images])

  const handleChange = (field) => (e) => {
    onFormChange({ ...formState, [field]: e.target.value })
  }

  const applySelectedFiles = useCallback(
    (incomingFiles) => {
      if (!incomingFiles.length) return
      const { images: next, error } = mergeValidationImages(images, incomingFiles)
      setLocalImageError(error)
      if (!error) {
        onImagesChange(next)
      }
    },
    [images, onImagesChange]
  )

  const handleImageSelect = useCallback(
    (e) => {
      const selected = Array.from(e.target.files || [])
      applySelectedFiles(selected)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [applySelectedFiles]
  )

  const openFilePicker = useCallback(() => {
    if (formDisabled || !canAddMore) return
    fileInputRef.current?.click()
  }, [formDisabled, canAddMore])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragOver(false)
      if (formDisabled || !canAddMore) return
      const selected = Array.from(e.dataTransfer.files || [])
      applySelectedFiles(selected)
    },
    [applySelectedFiles, formDisabled, canAddMore]
  )

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault()
      if (formDisabled || !canAddMore) return
      setIsDragOver(true)
    },
    [formDisabled, canAddMore]
  )

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDragEnter = useCallback(
    (e) => {
      e.preventDefault()
      if (formDisabled || !canAddMore) return
      setIsDragOver(true)
    },
    [formDisabled, canAddMore]
  )

  const handleDropzoneKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openFilePicker()
      }
    },
    [openFilePicker]
  )

  const removeImage = (index) => {
    onImagesChange(images.filter((_, i) => i !== index))
    setLocalImageError(null)
  }

  const applySponsorFile = useCallback(
    async (file) => {
      if (!file) return
      if (!isAllowedSponsorMimeType(file.type)) {
        setSponsorError('El logo debe ser PNG, JPEG o WebP')
        return
      }
      if (file.size > SPONSOR_MAX_BYTES) {
        setSponsorError('El logo no puede superar 2 MB')
        return
      }

      try {
        const sponsorLogo = {
          dataUrl: await readFileAsDataUrl(file),
          mimeType: file.type,
          fileName: file.name,
        }
        const validation = validateSponsorLogo(sponsorLogo)
        if (!validation.ok) throw new Error(validation.error)
        setSponsorError(null)
        onFormChange({ ...formState, sponsorLogo })
      } catch (error) {
        setSponsorError(error?.message || 'No se pudo leer el logo')
      }
    },
    [formState, onFormChange]
  )

  const clearSponsor = () => {
    setSponsorError(null)
    onFormChange({ ...formState, sponsorLogo: null })
    if (sponsorFileInputRef.current) sponsorFileInputRef.current.value = ''
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canValidate || disabled) return
    setShowFieldErrors(true)
    if (hasDynamicFieldErrors) return
    if (requiresImages && images.length === 0) {
      setLocalImageError(
        'Se requiere al menos una imagen para esta plataforma y tipo de contenido.'
      )
      return
    }
    setLocalImageError(null)
    onSubmit()
  }

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
            {contentTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.label}
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
            disabled={formDisabled || !canAddMore}
            onChange={handleImageSelect}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          <div
            role="button"
            tabIndex={formDisabled || !canAddMore ? -1 : 0}
            aria-disabled={formDisabled || !canAddMore}
            aria-label="Seleccionar o soltar imágenes para validar"
            onClick={openFilePicker}
            onKeyDown={handleDropzoneKeyDown}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDragEnter={handleDragEnter}
            className={`
              relative flex flex-col items-center justify-center
              border-2 border-dashed rounded-xl select-none
              transition-colors min-h-[140px] p-6 text-center
              ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }
              ${
                formDisabled || !canAddMore
                  ? 'opacity-60 cursor-not-allowed pointer-events-none'
                  : 'cursor-pointer'
              }
            `}
          >
            <svg
              className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {canAddMore
                ? 'Arrastra imágenes aquí o haz clic para elegirlas'
                : `Máximo de ${MAX_VALIDATION_IMAGES} imágenes alcanzado`}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Hasta {MAX_VALIDATION_IMAGES} imágenes · máx. 5 MB cada una
              {images.length > 0
                ? ` · ${images.length} seleccionada${images.length === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>

          {(localImageError || fieldError) && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {localImageError || fieldError}
            </p>
          )}

          {images.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {images.map((file, idx) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}-${idx}`}
                  className="relative rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
                >
                  <div className="aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                    {previewUrls[idx] ? (
                      // Local object URLs; next/image is not appropriate here.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrls[idx]}
                        alt={`Vista previa: ${file.name}`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-gray-400 px-2 text-center truncate w-full">
                        {file.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-gray-200 dark:border-gray-700">
                    <span
                      className="truncate text-xs text-gray-700 dark:text-gray-300"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      disabled={formDisabled}
                      onClick={() => removeImage(idx)}
                      className="text-red-600 dark:text-red-400 hover:underline text-xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ai-draft-text" className={labelClass}>
          {showImages ? 'Pie de foto / texto' : 'Borrador'} <span className="text-red-500">*</span>
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

      {contentTypeDefinition && (
        <section
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          aria-labelledby="validation-context-heading"
        >
          <h3
            id="validation-context-heading"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Contexto de {contentTypeDefinition.label}
          </h3>
          {contentTypeDefinition.description && (
            <p className="mt-1 mb-4 text-xs text-gray-500 dark:text-gray-400">
              {contentTypeDefinition.description}
            </p>
          )}
          <ContentTypeFields
            definition={contentTypeDefinition}
            formState={formState}
            onFormChange={onFormChange}
            disabled={formDisabled}
            idPrefix="validation-content"
            errors={showFieldErrors ? dynamicFieldErrors : {}}
          />
          {supportsSponsor && (
            <div className="mt-4">
              <label htmlFor="validation-content-sponsor" className={labelClass}>
                {sponsorField.label || 'Auspiciador'}
                {sponsorField.required && <span className="text-red-500"> *</span>}
              </label>
              <input
                ref={sponsorFileInputRef}
                id="validation-content-sponsor"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={formDisabled}
                onChange={(event) => applySponsorFile(event.target.files?.[0])}
                className={inputClass}
              />
              {sponsorField.help && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sponsorField.help}</p>
              )}
              {formState.sponsorLogo?.dataUrl && (
                <div className="mt-2 flex items-center gap-3">
                  {/* Local data URL; the Next image optimizer is not applicable. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formState.sponsorLogo.dataUrl}
                    alt="Vista previa del auspiciador"
                    className="h-14 max-w-40 rounded border border-gray-200 object-contain bg-white"
                  />
                  <button
                    type="button"
                    disabled={formDisabled}
                    onClick={clearSponsor}
                    className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </div>
              )}
              {(sponsorError || (showFieldErrors && dynamicFieldErrors.sponsor)) && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {sponsorError || dynamicFieldErrors.sponsor}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {contentTypeDefinition && (
        <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            Accesibilidad
          </summary>
          <div className="mt-4">
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
        </details>
      )}

      {!contentTypeDefinition && (
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
                {!canonicalEventName && (
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
                )}
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
      )}

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}
