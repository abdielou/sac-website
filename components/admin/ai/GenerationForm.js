'use client'

import { PLATFORMS, PLATFORM_LABELS, CONTENT_TYPES, CONTENT_TYPE_LABELS } from '@/lib/ai-constants'

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export const DEFAULT_GENERATION_FORM = {
  intent: '',
  topic: '',
  platforms: ['instagram'],
  contentType: 'regular_post',
  tone: '',
  audience: '',
  cta: '',
  knownFacts: '',
  hashtags: '',
  links: '',
  imageStyle: '',
  imageConstraints: '',
  eventName: '',
  eventDate: '',
  eventTime: '',
  eventLocation: '',
}

/**
 * @param {Object} props
 * @param {boolean} props.canGenerate
 * @param {boolean} props.disabled - form locked during submit/poll
 * @param {Object} props.formState
 * @param {Function} props.onFormChange
 * @param {Function} props.onSubmit
 */
export default function GenerationForm({
  canGenerate,
  disabled = false,
  formState,
  onFormChange,
  onSubmit,
}) {
  const showEventFields = formState.contentType === 'event_promotion'

  const handleChange = (field) => (e) => {
    onFormChange({ ...formState, [field]: e.target.value })
  }

  const togglePlatform = (platform) => {
    const selected = formState.platforms.includes(platform)
      ? formState.platforms.filter((p) => p !== platform)
      : [...formState.platforms, platform]
    onFormChange({ ...formState, platforms: selected })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canGenerate || disabled) return
    onSubmit()
  }

  const formDisabled = disabled || !canGenerate
  const submitDisabled =
    formDisabled ||
    !formState.intent.trim() ||
    !formState.topic.trim() ||
    formState.platforms.length === 0

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="generation-form">
      {!canGenerate && (
        <p className="text-sm text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          Tienes acceso de solo lectura. Se requiere permiso{' '}
          <code className="text-xs">write_ai</code> para iniciar generaciones.
        </p>
      )}

      <div>
        <label htmlFor="gen-intent" className={labelClass}>
          Intención <span className="text-red-500">*</span>
        </label>
        <input
          id="gen-intent"
          type="text"
          value={formState.intent}
          onChange={handleChange('intent')}
          disabled={formDisabled}
          required
          placeholder="ej. Invitar al público a una noche de observación"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="gen-topic" className={labelClass}>
          Tema <span className="text-red-500">*</span>
        </label>
        <textarea
          id="gen-topic"
          value={formState.topic}
          onChange={handleChange('topic')}
          disabled={formDisabled}
          rows={3}
          required
          placeholder="ej. Lluvia de meteoros Perseidas visible desde Puerto Rico"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset>
          <legend className={labelClass}>
            Plataformas <span className="text-red-500">*</span>
          </legend>
          <div className="flex flex-wrap gap-3 pt-1">
            {PLATFORMS.map((platform) => (
              <label
                key={platform}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={formState.platforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                  disabled={formDisabled}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                {PLATFORM_LABELS[platform]}
              </label>
            ))}
          </div>
          {formState.platforms.length === 0 && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              Selecciona al menos una plataforma.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="gen-content-type" className={labelClass}>
            Tipo de contenido
          </label>
          <select
            id="gen-content-type"
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

      <div>
        <label htmlFor="gen-tone" className={labelClass}>
          Tono
        </label>
        <input
          id="gen-tone"
          type="text"
          value={formState.tone}
          onChange={handleChange('tone')}
          disabled={formDisabled}
          placeholder="ej. cercano y educativo"
          className={inputClass}
        />
      </div>

      <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          Campos opcionales
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="gen-known-facts" className={labelClass}>
              Datos confirmados (uno por línea)
            </label>
            <textarea
              id="gen-known-facts"
              value={formState.knownFacts}
              onChange={handleChange('knownFacts')}
              disabled={formDisabled}
              rows={3}
              placeholder={'ej.\nSábado 15 de agosto, 7:00 PM\nPlaza de Guánica'}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              La IA solo usará estos datos; no inventará fechas, lugares ni enlaces.
            </p>
          </div>
          <div>
            <label htmlFor="gen-audience" className={labelClass}>
              Audiencia
            </label>
            <input
              id="gen-audience"
              type="text"
              value={formState.audience}
              onChange={handleChange('audience')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="gen-cta" className={labelClass}>
              Llamado a la acción (CTA)
            </label>
            <input
              id="gen-cta"
              type="text"
              value={formState.cta}
              onChange={handleChange('cta')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="gen-hashtags" className={labelClass}>
              Hashtags (separados por coma)
            </label>
            <input
              id="gen-hashtags"
              type="text"
              value={formState.hashtags}
              onChange={handleChange('hashtags')}
              disabled={formDisabled}
              placeholder="#astronomia, #SAC"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="gen-links" className={labelClass}>
              Enlaces (separados por coma)
            </label>
            <input
              id="gen-links"
              type="text"
              value={formState.links}
              onChange={handleChange('links')}
              disabled={formDisabled}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="gen-image-style" className={labelClass}>
                Estilo de imagen
              </label>
              <input
                id="gen-image-style"
                type="text"
                value={formState.imageStyle}
                onChange={handleChange('imageStyle')}
                disabled={formDisabled}
                placeholder="ej. ilustración nocturna"
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
                onChange={handleChange('imageConstraints')}
                disabled={formDisabled}
                placeholder="ej. sin rostros identificables"
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cada generación incluye prompts e imágenes de borrador descargables (excepto captions de
            reel). Estilo y restricciones refinan el resultado visual.
          </p>

          {showEventFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="sm:col-span-2">
                <label htmlFor="gen-event-name" className={labelClass}>
                  Nombre del evento
                </label>
                <input
                  id="gen-event-name"
                  type="text"
                  value={formState.eventName}
                  onChange={handleChange('eventName')}
                  disabled={formDisabled}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="gen-event-date" className={labelClass}>
                  Fecha
                </label>
                <input
                  id="gen-event-date"
                  type="text"
                  value={formState.eventDate}
                  onChange={handleChange('eventDate')}
                  disabled={formDisabled}
                  placeholder="ej. 15 de agosto"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="gen-event-time" className={labelClass}>
                  Hora
                </label>
                <input
                  id="gen-event-time"
                  type="text"
                  value={formState.eventTime}
                  onChange={handleChange('eventTime')}
                  disabled={formDisabled}
                  placeholder="ej. 7:00 PM"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="gen-event-location" className={labelClass}>
                  Lugar
                </label>
                <input
                  id="gen-event-location"
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

      {canGenerate && (
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitDisabled}
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
            {disabled ? 'Generando...' : 'Generar borradores'}
          </button>
        </div>
      )}
    </form>
  )
}
