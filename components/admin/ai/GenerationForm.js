'use client'

import React, { useCallback, useRef, useState } from 'react'
import {
  GENERATION_INPUT_LIMITS,
  DEFAULT_SEED_PLATFORMS,
  contentTypeRequiresEventCta,
  getCanonicalEventName,
  isEventContentType,
  shouldGenerateImagePrompt,
} from '@/lib/ai-constants'
import { listBackgroundOptions } from '@/lib/social-template/backgroundCatalog'
import { DEFAULT_GENERATION_FORM } from '@/lib/social-template/buildGenerationPayload'
import { SPONSOR_MAX_BYTES, isAllowedSponsorMimeType } from '@/lib/social-template/eventFormHelpers'
import { resolveTemplateLayoutId } from '@/lib/social-template/templateLayouts'
import ContentTypeFields, {
  formStateKeyForContentField,
} from '@/components/admin/ai/ContentTypeFields'

export { DEFAULT_GENERATION_FORM }

const BACKGROUND_OPTIONS = listBackgroundOptions()

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
const sectionClass =
  'rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-4 sm:p-5 space-y-4'
const sectionTitleClass = 'text-sm font-semibold tracking-wide text-gray-900 dark:text-gray-100'
const maxListInputLength =
  GENERATION_INPUT_LIMITS.listItems * GENERATION_INPUT_LIMITS.listItem +
  (GENERATION_INPUT_LIMITS.listItems - 1) * 2

function validateListInput(value, separator, label) {
  const items = String(value || '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean)
  if (items.length > GENERATION_INPUT_LIMITS.listItems) {
    return `${label}: máximo ${GENERATION_INPUT_LIMITS.listItems}`
  }
  if (items.some((item) => item.length > GENERATION_INPUT_LIMITS.listItem)) {
    return `${label}: cada elemento admite hasta ${GENERATION_INPUT_LIMITS.listItem} caracteres`
  }
  return null
}

/**
 * @param {Object} props
 * @param {boolean} props.canGenerate
 * @param {boolean} props.loading
 * @param {boolean} props.busy
 * @param {Object} props.formState
 * @param {Function} props.onFormChange
 * @param {Function} props.onSubmit
 * @param {{ id: string, label: string }[]} [props.contentTypes]
 */
export default function GenerationForm({
  canGenerate,
  loading = false,
  busy = false,
  formState,
  onFormChange,
  onSubmit,
  contentTypes = [],
  platforms = DEFAULT_SEED_PLATFORMS,
}) {
  const resolvedPlatforms =
    Array.isArray(platforms) && platforms.length ? platforms : DEFAULT_SEED_PLATFORMS
  const contentTypeDefinition = contentTypes.find(
    ({ id }) => id === formState.contentType
  )?.definition
  const isEvent = isEventContentType(formState.contentType, contentTypeDefinition)
  const canonicalEventName = getCanonicalEventName(formState.contentType, contentTypeDefinition)
  const requiresEventCta = contentTypeRequiresEventCta(formState.contentType, contentTypeDefinition)
  const supportsImageForSelection = shouldGenerateImagePrompt(
    formState.contentType,
    { platforms: resolvedPlatforms },
    contentTypeDefinition
  )
  const supportsTemplate =
    supportsImageForSelection &&
    Boolean(resolveTemplateLayoutId(formState.contentType, contentTypeDefinition))
  const supportsGeneratedImage = shouldGenerateImagePrompt(
    formState.contentType,
    { platforms: resolvedPlatforms },
    contentTypeDefinition
  )
  const configuredBackgroundSources = contentTypeDefinition?.visual?.backgroundSources || []
  const allowsStockBackground = contentTypeDefinition
    ? configuredBackgroundSources.includes('stock')
    : supportsTemplate
  const allowsAiBackground = contentTypeDefinition
    ? configuredBackgroundSources.includes('ai_generated')
    : supportsGeneratedImage
  const allowsFullAiImage = contentTypeDefinition
    ? contentTypeDefinition.visual?.mode === 'ai_image'
    : supportsGeneratedImage && !supportsTemplate
  const showImageSection = supportsTemplate || allowsFullAiImage
  const sponsorField = contentTypeDefinition?.fields?.find(({ key }) => key === 'sponsor')
  const supportsSponsor = contentTypeDefinition
    ? supportsImageForSelection &&
      contentTypeDefinition.visual?.sponsorAllowed === true &&
      Boolean(sponsorField)
    : isEvent
  const sponsorRequired = sponsorField?.required === true
  const fileInputRef = useRef(null)
  const [sponsorError, setSponsorError] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [touched, setTouched] = useState({})

  const formDisabled = loading || busy || !canGenerate

  const handleChange = (field) => (e) => {
    onFormChange({ ...formState, [field]: e.target.value })
  }

  const handleContentTypeChange = (e) => {
    const contentType = e.target.value
    const next = { ...formState, contentType }
    const nextDefinition = contentTypes.find(({ id }) => id === contentType)?.definition
    const nextSupportsGeneratedImage = shouldGenerateImagePrompt(
      contentType,
      { platforms: resolvedPlatforms },
      nextDefinition
    )
    const nextSupportsTemplate =
      nextSupportsGeneratedImage && Boolean(resolveTemplateLayoutId(contentType, nextDefinition))
    const nextBackgroundSources = nextDefinition?.visual?.backgroundSources || []
    const nextAllowsStock = nextDefinition
      ? nextBackgroundSources.includes('stock')
      : nextSupportsTemplate
    const nextAllowsAiBackground = nextDefinition
      ? nextBackgroundSources.includes('ai_generated')
      : nextSupportsGeneratedImage

    if (!nextSupportsTemplate) {
      next.backgroundMode = ''
      next.backgroundId = ''
    } else if (
      (next.backgroundMode === 'stock' && !nextAllowsStock) ||
      (next.backgroundMode === 'ai_generated' && !nextAllowsAiBackground) ||
      !['stock', 'ai_generated'].includes(next.backgroundMode)
    ) {
      next.backgroundMode = nextAllowsStock ? 'stock' : nextAllowsAiBackground ? 'ai_generated' : ''
      next.backgroundId =
        next.backgroundMode === 'stock' ? next.backgroundId || BACKGROUND_OPTIONS[0]?.id || '' : ''
    }
    if (!nextSupportsGeneratedImage && !nextSupportsTemplate) {
      next.imageStyle = ''
      next.imageConstraints = ''
    }
    onFormChange(next)
  }

  const markTouched = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  const setBackgroundMode = (mode) => {
    onFormChange({
      ...formState,
      backgroundMode: mode,
      backgroundId:
        mode === 'stock' ? formState.backgroundId || BACKGROUND_OPTIONS[0]?.id || '' : '',
    })
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
        const dataUrl = await readFileAsDataUrl(file)
        setSponsorError(null)
        onFormChange({
          ...formState,
          sponsorLogo: {
            dataUrl,
            mimeType: file.type,
            fileName: file.name,
          },
        })
      } catch {
        setSponsorError('No se pudo leer el logo')
      }
    },
    [formState, onFormChange]
  )

  const clearSponsor = () => {
    setSponsorError(null)
    onFormChange({ ...formState, sponsorLogo: null })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const fieldErrors = {
    eventName:
      isEvent && !canonicalEventName && !formState.eventName?.trim()
        ? 'Indica el nombre del evento'
        : null,
    eventDate: isEvent && !formState.eventDate?.trim() ? 'Indica la fecha' : null,
    eventTime: isEvent && !formState.eventTime?.trim() ? 'Indica la hora' : null,
    eventLocation: isEvent && !formState.eventLocation?.trim() ? 'Indica el lugar' : null,
    eventCta:
      isEvent && requiresEventCta && !formState.eventCta?.trim()
        ? 'Indica el llamado a la acción'
        : null,
    intent: !isEvent && !formState.intent?.trim() ? 'Indica la intención' : null,
    topic: !isEvent && !formState.topic?.trim() ? 'Indica el tema' : null,
    knownFacts: validateListInput(formState.knownFacts, '\n', 'Datos confirmados'),
    hashtags: validateListInput(formState.hashtags, ',', 'Hashtags'),
    links: validateListInput(formState.links, ',', 'Enlaces'),
  }
  const dynamicFieldErrors = Object.fromEntries(
    (contentTypeDefinition?.fields || []).map((field) => {
      if (field.key === 'sponsor') {
        return [
          field.key,
          supportsSponsor && field.required && !formState.sponsorLogo?.dataUrl
            ? `${field.label || 'El auspiciador'} es obligatorio`
            : null,
        ]
      }
      const stateKey = formStateKeyForContentField(field.key, contentTypeDefinition)
      const value = stateKey ? formState[stateKey] : ''
      if (field.required && !String(value || '').trim()) {
        return [field.key, `${field.label || 'Este campo'} es obligatorio`]
      }
      if (field.key === 'known_facts') {
        return [field.key, validateListInput(value, '\n', field.label || 'Datos confirmados')]
      }
      if (field.key === 'hashtags' || field.key === 'links') {
        return [field.key, validateListInput(value, ',', field.label || field.key)]
      }
      return [field.key, null]
    })
  )

  const backgroundError =
    supportsTemplate &&
    ((formState.backgroundMode === 'stock' && !allowsStockBackground) ||
      (formState.backgroundMode === 'ai_generated' && !allowsAiBackground) ||
      !['stock', 'ai_generated'].includes(formState.backgroundMode))
      ? 'Selecciona un origen de imagen permitido'
      : supportsTemplate && formState.backgroundMode === 'stock' && !formState.backgroundId
        ? 'Selecciona un fondo'
        : null
  const hasFieldErrors = contentTypeDefinition
    ? Object.values(dynamicFieldErrors).some(Boolean)
    : Object.values(fieldErrors).some(Boolean)
  const submitDisabled = formDisabled
  const submitLabel = busy
    ? 'Generando borradores...'
    : loading
      ? 'Cargando opciones...'
      : 'Generar borradores'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canGenerate || loading || busy) return
    setTouched({
      background: true,
      eventName: true,
      eventDate: true,
      eventTime: true,
      eventLocation: true,
      eventCta: true,
      intent: true,
      topic: true,
      knownFacts: true,
      hashtags: true,
      links: true,
      dynamic: true,
    })
    if (backgroundError || hasFieldErrors || (supportsSponsor && sponsorError)) return
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      data-testid="generation-form"
      aria-busy={busy}
      noValidate
    >
      {!canGenerate && (
        <p className="text-sm text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          Tienes acceso de solo lectura. Solicita permiso de edición para iniciar generaciones.
        </p>
      )}

      {/* 1. Content type determines the fields and visual options that follow. */}
      <section className={sectionClass} aria-labelledby="gen-publication-heading">
        <h3 id="gen-publication-heading" className={sectionTitleClass}>
          1. Publicación
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          El caption y la imagen se compartirán en X, Instagram y Facebook.
        </p>

        <div>
          <label htmlFor="gen-content-type" className={labelClass}>
            Tipo de contenido
          </label>
          <select
            id="gen-content-type"
            value={formState.contentType}
            onChange={handleContentTypeChange}
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
      </section>

      {/* 2. The active content-type definition controls the data contract. */}
      {contentTypeDefinition ? (
        <section className={sectionClass} aria-labelledby="gen-content-heading">
          <h3 id="gen-content-heading" className={sectionTitleClass}>
            2. Datos de {contentTypeDefinition.label}
          </h3>
          {contentTypeDefinition.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              {contentTypeDefinition.description}
            </p>
          )}
          <ContentTypeFields
            definition={contentTypeDefinition}
            formState={formState}
            onFormChange={onFormChange}
            disabled={formDisabled}
            idPrefix="gen-content"
            errors={touched.dynamic ? dynamicFieldErrors : {}}
          />
        </section>
      ) : isEvent ? (
        <section className={sectionClass} aria-labelledby="gen-event-heading">
          <h3 id="gen-event-heading" className={sectionTitleClass}>
            {canonicalEventName ? `2. Datos de ${canonicalEventName}` : '2. Datos del evento'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            {!requiresEventCta
              ? 'La fecha, la hora y el lugar son obligatorios. El llamado a la acción es opcional.'
              : 'Estos datos se usan en el arte y en el texto. Todos son obligatorios.'}
          </p>

          {!canonicalEventName && (
            <div>
              <label htmlFor="gen-event-name" className={labelClass}>
                Nombre del evento <span className="text-red-500">*</span>
              </label>
              <input
                id="gen-event-name"
                type="text"
                value={formState.eventName || ''}
                maxLength={GENERATION_INPUT_LIMITS.eventName}
                onChange={handleChange('eventName')}
                onBlur={() => markTouched('eventName')}
                disabled={formDisabled}
                required
                placeholder="ej. Observación de las Perseidas"
                aria-invalid={Boolean(touched.eventName && fieldErrors.eventName)}
                aria-describedby={
                  touched.eventName && fieldErrors.eventName ? 'gen-event-name-error' : undefined
                }
                className={inputClass}
              />
              {touched.eventName && fieldErrors.eventName && (
                <p
                  id="gen-event-name-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {fieldErrors.eventName}.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="gen-event-date" className={labelClass}>
                Fecha <span className="text-red-500">*</span>
              </label>
              <input
                id="gen-event-date"
                type="date"
                value={formState.eventDate}
                onChange={handleChange('eventDate')}
                onBlur={() => markTouched('eventDate')}
                disabled={formDisabled}
                required
                aria-invalid={Boolean(touched.eventDate && fieldErrors.eventDate)}
                aria-describedby={
                  touched.eventDate && fieldErrors.eventDate ? 'gen-event-date-error' : undefined
                }
                className={inputClass}
              />
              {touched.eventDate && fieldErrors.eventDate && (
                <p
                  id="gen-event-date-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {fieldErrors.eventDate}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="gen-event-time" className={labelClass}>
                Hora <span className="text-red-500">*</span>
              </label>
              <input
                id="gen-event-time"
                type="time"
                value={formState.eventTime}
                onChange={handleChange('eventTime')}
                onBlur={() => markTouched('eventTime')}
                disabled={formDisabled}
                required
                aria-invalid={Boolean(touched.eventTime && fieldErrors.eventTime)}
                aria-describedby={
                  touched.eventTime && fieldErrors.eventTime ? 'gen-event-time-error' : undefined
                }
                className={inputClass}
              />
              {touched.eventTime && fieldErrors.eventTime && (
                <p
                  id="gen-event-time-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {fieldErrors.eventTime}.
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="gen-event-location" className={labelClass}>
              Lugar <span className="text-red-500">*</span>
            </label>
            <input
              id="gen-event-location"
              type="text"
              value={formState.eventLocation}
              maxLength={GENERATION_INPUT_LIMITS.eventLocation}
              onChange={handleChange('eventLocation')}
              onBlur={() => markTouched('eventLocation')}
              disabled={formDisabled}
              required
              placeholder="ej. Pitahaya, Cabo Rojo"
              aria-invalid={Boolean(touched.eventLocation && fieldErrors.eventLocation)}
              aria-describedby={
                touched.eventLocation && fieldErrors.eventLocation
                  ? 'gen-event-location-error'
                  : undefined
              }
              className={inputClass}
            />
            {touched.eventLocation && fieldErrors.eventLocation && (
              <p
                id="gen-event-location-error"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.eventLocation}.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="gen-event-cta" className={labelClass}>
              Llamado a la acción
              {!requiresEventCta ? (
                <span className="font-normal text-gray-500 dark:text-gray-400"> (opcional)</span>
              ) : (
                <span className="text-red-500"> *</span>
              )}
            </label>
            <input
              id="gen-event-cta"
              type="text"
              value={formState.eventCta || ''}
              maxLength={GENERATION_INPUT_LIMITS.cta}
              onChange={handleChange('eventCta')}
              onBlur={() => markTouched('eventCta')}
              disabled={formDisabled}
              required={requiresEventCta}
              placeholder="ej. Confirma tu asistencia en el enlace"
              aria-invalid={Boolean(touched.eventCta && fieldErrors.eventCta)}
              aria-describedby={
                touched.eventCta && fieldErrors.eventCta ? 'gen-event-cta-error' : undefined
              }
              className={inputClass}
            />
            {touched.eventCta && fieldErrors.eventCta && (
              <p
                id="gen-event-cta-error"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.eventCta}.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className={sectionClass} aria-labelledby="gen-topic-heading">
          <h3 id="gen-topic-heading" className={sectionTitleClass}>
            2. Contenido
          </h3>
          <div>
            <label htmlFor="gen-intent" className={labelClass}>
              Intención <span className="text-red-500">*</span>
            </label>
            <input
              id="gen-intent"
              type="text"
              value={formState.intent}
              maxLength={GENERATION_INPUT_LIMITS.intent}
              onChange={handleChange('intent')}
              onBlur={() => markTouched('intent')}
              disabled={formDisabled}
              required
              placeholder="ej. Educar sobre el cielo nocturno"
              aria-invalid={Boolean(touched.intent && fieldErrors.intent)}
              aria-describedby={
                touched.intent && fieldErrors.intent ? 'gen-intent-error' : undefined
              }
              className={inputClass}
            />
            {touched.intent && fieldErrors.intent && (
              <p
                id="gen-intent-error"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.intent}.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="gen-topic" className={labelClass}>
              Tema <span className="text-red-500">*</span>
            </label>
            <textarea
              id="gen-topic"
              value={formState.topic}
              maxLength={GENERATION_INPUT_LIMITS.topic}
              onChange={handleChange('topic')}
              onBlur={() => markTouched('topic')}
              disabled={formDisabled}
              rows={3}
              required
              placeholder="ej. Lluvia de meteoros Perseidas"
              aria-invalid={Boolean(touched.topic && fieldErrors.topic)}
              aria-describedby={touched.topic && fieldErrors.topic ? 'gen-topic-error' : undefined}
              className={inputClass}
            />
            {touched.topic && fieldErrors.topic && (
              <p
                id="gen-topic-error"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {fieldErrors.topic}.
              </p>
            )}
          </div>
        </section>
      )}

      {/* 3. Image controls only appear when the selected content type supports them. */}
      {showImageSection && (
        <section className={sectionClass} aria-labelledby="gen-image-heading">
          <h3 id="gen-image-heading" className={sectionTitleClass}>
            3. Imagen
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            {supportsTemplate
              ? isEvent
                ? 'Elige el fondo del arte. El logo de SAC y el aviso del clima se incluyen automáticamente.'
                : supportsGeneratedImage
                  ? 'Elige una plantilla con fondo existente, un fondo generado por IA o una imagen completa.'
                  : 'Elige el fondo de plantilla para el arte.'
              : 'Este tipo genera una imagen completa con IA. Puedes ajustar el estilo en Opciones avanzadas.'}
          </p>

          {supportsTemplate && (
            <fieldset
              disabled={formDisabled}
              aria-invalid={Boolean(touched.background && backgroundError)}
              aria-describedby={
                touched.background && backgroundError ? 'gen-background-error' : undefined
              }
            >
              <legend className="sr-only">Origen de la imagen</legend>
              <div className="space-y-2">
                {allowsStockBackground && (
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="backgroundMode"
                      checked={formState.backgroundMode === 'stock'}
                      onChange={() => setBackgroundMode('stock')}
                      className="mt-0.5 border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Usar fondo de plantilla</span>
                  </label>
                )}
                {allowsAiBackground && (
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="backgroundMode"
                      checked={formState.backgroundMode === 'ai_generated'}
                      onChange={() => setBackgroundMode('ai_generated')}
                      className="mt-0.5 border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Generar fondo con IA</span>
                  </label>
                )}
              </div>
            </fieldset>
          )}

          {supportsTemplate && formState.backgroundMode === 'stock' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BACKGROUND_OPTIONS.map((bg) => {
                const selected = formState.backgroundId === bg.id
                return (
                  <button
                    key={bg.id}
                    type="button"
                    disabled={formDisabled}
                    aria-pressed={selected}
                    onClick={() => {
                      markTouched('background')
                      onFormChange({ ...formState, backgroundId: bg.id })
                    }}
                    className={`text-left rounded-lg border overflow-hidden transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selected
                        ? 'border-blue-500 ring-2 ring-blue-500 dark:border-blue-500 dark:ring-blue-500'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bg.thumbnailUrl}
                      alt=""
                      className="w-full aspect-[3/4] object-cover bg-gray-100 dark:bg-gray-800"
                    />
                    <span className="block px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {bg.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {touched.background && backgroundError && (
            <p
              id="gen-background-error"
              className="text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {backgroundError}.
            </p>
          )}
        </section>
      )}

      {/* 4. Optional sponsor when explicitly enabled by the definition. */}
      {supportsSponsor && (
        <section className={sectionClass} aria-labelledby="gen-sponsor-heading">
          <h3 id="gen-sponsor-heading" className={sectionTitleClass}>
            4. Auspiciador{' '}
            {sponsorRequired ? (
              <span className="text-red-500">*</span>
            ) : (
              <span className="font-normal text-gray-500">(opcional)</span>
            )}
          </h3>
          <p id="gen-sponsor-help" className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            Sube el logo del auspiciador. Aparecerá como “Auspicia” en la esquina inferior derecha.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={formDisabled}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) applySponsorFile(file)
              e.target.value = ''
            }}
          />

          {formState.sponsorLogo?.dataUrl ? (
            <div className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={formState.sponsorLogo.dataUrl}
                alt="Vista previa del auspiciador"
                className="h-16 w-16 object-contain rounded bg-gray-50 dark:bg-gray-800"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {formState.sponsorLogo.fileName || 'Logo de auspiciador'}
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    disabled={formDisabled}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 dark:text-blue-400 underline disabled:opacity-50"
                  >
                    Reemplazar
                  </button>
                  <button
                    type="button"
                    disabled={formDisabled}
                    onClick={clearSponsor}
                    className="text-xs text-red-600 dark:text-red-400 underline disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={formDisabled ? -1 : 0}
              aria-disabled={formDisabled}
              aria-label="Subir logo del auspiciador"
              aria-describedby={
                sponsorError ? 'gen-sponsor-help gen-sponsor-error' : 'gen-sponsor-help'
              }
              onClick={() => {
                if (!formDisabled) fileInputRef.current?.click()
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !formDisabled) {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (!formDisabled) setIsDragOver(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragOver(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragOver(false)
                if (formDisabled) return
                const file = e.dataTransfer.files?.[0]
                if (file) applySponsorFile(file)
              }}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl min-h-[120px] p-4 text-center transition-colors ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              } ${formDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Arrastra el logo aquí o haz clic para elegirlo
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                PNG, JPEG o WebP · máx. 2 MB
              </p>
            </div>
          )}
          {sponsorError && (
            <p
              id="gen-sponsor-error"
              className="text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {sponsorError}.
            </p>
          )}
          {touched.dynamic && dynamicFieldErrors.sponsor && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {dynamicFieldErrors.sponsor}.
            </p>
          )}
        </section>
      )}

      {/* Legacy fallback while an older guideline document is being migrated. */}
      {!contentTypeDefinition && (
        <details className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            Opciones avanzadas
          </summary>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="gen-tone" className={labelClass}>
                Tono
              </label>
              <input
                id="gen-tone"
                type="text"
                value={formState.tone}
                maxLength={GENERATION_INPUT_LIMITS.tone}
                onChange={handleChange('tone')}
                disabled={formDisabled}
                placeholder="ej. cercano y educativo"
                className={inputClass}
              />
            </div>
            {!isEvent && (
              <div>
                <label htmlFor="gen-cta" className={labelClass}>
                  Llamado a la acción (CTA)
                </label>
                <input
                  id="gen-cta"
                  type="text"
                  value={formState.cta}
                  maxLength={GENERATION_INPUT_LIMITS.cta}
                  onChange={handleChange('cta')}
                  disabled={formDisabled}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label htmlFor="gen-audience" className={labelClass}>
                Audiencia
              </label>
              <input
                id="gen-audience"
                type="text"
                value={formState.audience}
                maxLength={GENERATION_INPUT_LIMITS.audience}
                onChange={handleChange('audience')}
                disabled={formDisabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="gen-known-facts" className={labelClass}>
                Datos confirmados (uno por línea)
              </label>
              <textarea
                id="gen-known-facts"
                value={formState.knownFacts}
                maxLength={maxListInputLength}
                onChange={handleChange('knownFacts')}
                onBlur={() => markTouched('knownFacts')}
                disabled={formDisabled}
                rows={3}
                aria-invalid={Boolean(touched.knownFacts && fieldErrors.knownFacts)}
                aria-describedby={
                  touched.knownFacts && fieldErrors.knownFacts ? 'gen-known-facts-error' : undefined
                }
                className={inputClass}
              />
              {touched.knownFacts && fieldErrors.knownFacts && (
                <p
                  id="gen-known-facts-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {fieldErrors.knownFacts}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="gen-hashtags" className={labelClass}>
                Hashtags (separados por coma)
              </label>
              <input
                id="gen-hashtags"
                type="text"
                value={formState.hashtags}
                maxLength={maxListInputLength}
                onChange={handleChange('hashtags')}
                onBlur={() => markTouched('hashtags')}
                disabled={formDisabled}
                placeholder="#astronomia, #SAC"
                aria-invalid={Boolean(touched.hashtags && fieldErrors.hashtags)}
                aria-describedby={
                  touched.hashtags && fieldErrors.hashtags ? 'gen-hashtags-error' : undefined
                }
                className={inputClass}
              />
              {touched.hashtags && fieldErrors.hashtags && (
                <p
                  id="gen-hashtags-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {fieldErrors.hashtags}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="gen-links" className={labelClass}>
                Enlaces (separados por coma)
              </label>
              <input
                id="gen-links"
                type="text"
                value={formState.links}
                maxLength={maxListInputLength}
                onChange={handleChange('links')}
                onBlur={() => markTouched('links')}
                disabled={formDisabled}
                aria-invalid={Boolean(touched.links && fieldErrors.links)}
                aria-describedby={
                  touched.links && fieldErrors.links ? 'gen-links-error' : undefined
                }
                className={inputClass}
              />
              {touched.links && fieldErrors.links && (
                <p
                  id="gen-links-error"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {fieldErrors.links}.
                </p>
              )}
            </div>
            {supportsGeneratedImage && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gen-image-style" className={labelClass}>
                    Estilo de imagen
                  </label>
                  <input
                    id="gen-image-style"
                    type="text"
                    value={formState.imageStyle}
                    maxLength={GENERATION_INPUT_LIMITS.imageStyle}
                    onChange={handleChange('imageStyle')}
                    disabled={formDisabled}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="gen-image-constraints" className={labelClass}>
                    Restricciones de imagen
                  </label>
                  <input
                    id="gen-image-constraints"
                    type="text"
                    value={formState.imageConstraints}
                    maxLength={GENERATION_INPUT_LIMITS.imageConstraints}
                    onChange={handleChange('imageConstraints')}
                    disabled={formDisabled}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {canGenerate && (
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitDisabled}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {(loading || busy) && (
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
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  )
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}
