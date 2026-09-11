'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import GenerationForm from '@/components/admin/ai/GenerationForm'
import GenerationResult from '@/components/admin/ai/GenerationResult'
import { useAiGenerationRun } from '@/lib/hooks/useAiGenerationRun'
import { useActiveGuidelines } from '@/lib/hooks/useActiveGuidelines'
import { useGenerationDraft } from '@/lib/hooks/GenerationDraftProvider'
import { resolveContentTypeOptions, resolvePlatformOptions } from '@/lib/ai-guidelines-draft'
import { ErrorState } from '@/components/admin/ErrorState'

const PRESERVED_FORM_MESSAGE =
  'Tu formulario sigue aquí con el texto y los datos que escribiste; no necesitas empezar de nuevo.'
const RECORDED_RUN_MESSAGE =
  'La causa quedó registrada. Como esta ejecución se recuperó después de salir, revisa el formulario actual antes de iniciar otro intento.'

const IMAGE_FAILURE_PRESENTATIONS = Object.freeze({
  image_provider_not_configured: {
    title: 'Falta configurar la generación de imágenes',
    summary:
      'El proveedor de imágenes no está configurado. Un administrador debe añadir la credencial de OpenRouter.',
    recovery:
      'No repetimos el intento porque primero debe corregirse la configuración del servicio.',
  },
  image_provider_configuration_error: {
    title: 'La configuración del servicio necesita revisión',
    summary:
      'OpenRouter rechazó la configuración del modelo de imágenes. Un administrador debe revisar el modelo y la cuenta del proveedor.',
    recovery:
      'No repetimos el intento porque volver a enviarlo con la misma configuración no lo resolvería.',
  },
  image_provider_retry_exhausted: {
    title: 'El servicio de imágenes no respondió',
    summary: 'No recibimos una imagen utilizable después de los intentos automáticos.',
    recovery: 'Ya reintentamos la generación automáticamente antes de detenernos.',
  },
  image_provider_rejected: {
    title: 'El servicio de imágenes rechazó la solicitud',
    summary: 'El servicio no pudo aceptar esta solicitud de imagen.',
    recovery:
      'No consumimos otro intento automático porque repetir la misma solicitud no resolvería el rechazo.',
  },
  image_post_processing_failed: {
    title: 'La imagen se generó, pero no quedó lista',
    summary:
      'Recibimos el archivo, pero no pudimos convertirlo en una imagen segura para mostrar y descargar.',
    recovery: 'Regeneramos y preparamos la imagen automáticamente antes de detenernos.',
    nonRetryableRecovery:
      'Detectamos que repetir la misma operación volvería a fallar, así que evitamos otro intento inútil.',
  },
  image_asset_processing_failed: {
    title: 'La respuesta no pudo prepararse como imagen',
    summary: 'El servicio respondió, pero ocurrió un fallo interno al preparar el asset.',
    recovery:
      'No repetimos la misma solicitud porque ese fallo interno no se corrige consumiendo otra generación.',
  },
  image_prompt_retry_exhausted: {
    title: 'No pudimos cerrar las instrucciones visuales',
    summary:
      'Las instrucciones para crear la imagen no pasaron la validación después de varios intentos.',
    recovery: 'Las reformulamos automáticamente antes de detener la generación.',
  },
  image_prompt_processing_failed: {
    title: 'No pudimos preparar las instrucciones visuales',
    summary: 'La respuesta visual no tuvo el formato necesario para continuar.',
    recovery: 'Intentamos repararla automáticamente antes de detener la generación.',
  },
  template_background_invalid: {
    title: 'El fondo seleccionado ya no está disponible',
    summary: 'Las Guidelines activas ya no incluyen el fondo seleccionado.',
    recovery:
      'No iniciamos otra generación porque primero debes elegir un fondo disponible en el formulario.',
  },
})

const GENERIC_IMAGE_FAILURE_PRESENTATION = Object.freeze({
  title: 'No pudimos completar la imagen',
  summary: 'No se pudo obtener una imagen lista para usar.',
  recovery: 'Intentamos completar la imagen automáticamente antes de detener la generación.',
  showFailureMessage: true,
})

function resolveImageFailurePresentation(failure) {
  const code = typeof failure?.code === 'string' ? failure.code.toLowerCase() : ''
  const stage = typeof failure?.stage === 'string' ? failure.stage.toLowerCase() : ''
  if (IMAGE_FAILURE_PRESENTATIONS[code]) return IMAGE_FAILURE_PRESENTATIONS[code]

  const isImageFailure =
    code === 'required_image_unavailable' ||
    code.startsWith('image_') ||
    ['image_prompt', 'image_provider', 'image_preparation', 'image_generation'].includes(stage)
  if (!isImageFailure) return null

  if (stage === 'image_preparation') {
    return IMAGE_FAILURE_PRESENTATIONS.image_post_processing_failed
  }
  if (stage === 'image_provider') {
    return failure?.retryable === true
      ? IMAGE_FAILURE_PRESENTATIONS.image_provider_retry_exhausted
      : IMAGE_FAILURE_PRESENTATIONS.image_provider_rejected
  }
  if (stage === 'image_prompt') {
    return failure?.retryable === true
      ? IMAGE_FAILURE_PRESENTATIONS.image_prompt_retry_exhausted
      : IMAGE_FAILURE_PRESENTATIONS.image_prompt_processing_failed
  }
  return GENERIC_IMAGE_FAILURE_PRESENTATION
}

function resolvePublicFailureMessage(failure, error, fallback) {
  const raw = typeof failure?.message === 'string' ? failure.message : error
  const message = typeof raw === 'string' ? raw.trim() : ''
  const code = typeof failure?.code === 'string' ? failure.code.trim().toLowerCase() : ''
  if (!message || message.toLowerCase() === code) return fallback
  if (/^[a-z0-9_.:-]+$/i.test(message) && /[_.:]/.test(message)) return fallback
  return message.slice(0, 500)
}

function AssistedGenerationFailure({
  failure,
  error,
  presentation,
  canRetry,
  hasCurrentDraft,
  onRetry,
  onBack,
}) {
  const message = presentation.showFailureMessage
    ? resolvePublicFailureMessage(failure, error, presentation.summary)
    : presentation.summary
  const recovery =
    failure?.retryable === false && presentation.nonRetryableRecovery
      ? presentation.nonRetryableRecovery
      : presentation.recovery

  return (
    <section
      className="rounded-xl border border-amber-300 bg-amber-50/80 p-5 text-left dark:border-amber-800 dark:bg-amber-950/20"
      role="alert"
      aria-live="assertive"
      data-testid="generation-assisted-failure"
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M12 7v6m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3.75a2 2 0 0 0-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            La generación se detuvo
          </p>
          <h3 className="mt-1 text-base font-semibold text-gray-950 dark:text-white">
            {presentation.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{message}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-white/70 p-3 dark:border-amber-900 dark:bg-black/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Recuperación automática
          </p>
          <p className="mt-1 text-sm leading-5 text-gray-700 dark:text-gray-300">{recovery}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white/70 p-3 dark:border-amber-900 dark:bg-black/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Tu trabajo</p>
          <p className="mt-1 text-sm leading-5 text-gray-700 dark:text-gray-300">
            {hasCurrentDraft ? PRESERVED_FORM_MESSAGE : RECORDED_RUN_MESSAGE}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            Intentar de nuevo
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-amber-700 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/30"
        >
          Volver al formulario
        </button>
      </div>
    </section>
  )
}

export default function AiGenerationClient() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canGenerate = accessibleActions.includes('write_ai')

  const { active, hydrated: guidelinesHydrated } = useActiveGuidelines()
  const contentTypes = useMemo(
    () => resolveContentTypeOptions(active, { includeDefinitions: true }),
    [active]
  )
  const platformOptions = useMemo(() => resolvePlatformOptions(active), [active])
  const platforms = useMemo(() => platformOptions.map(({ id }) => id), [platformOptions])
  const platformLabels = useMemo(
    () => Object.fromEntries(platformOptions.map(({ id, label }) => [id, label])),
    [platformOptions]
  )

  const { formState, setFormState, draftSession } = useGenerationDraft()
  const selectedContentType = contentTypes.find(({ id }) => id === formState.contentType)
  const formReady = guidelinesHydrated && Boolean(selectedContentType)
  const resultRef = useRef(null)

  useEffect(() => {
    if (!guidelinesHydrated || !contentTypes.length) return
    const ids = contentTypes.map((ct) => ct.id)
    setFormState((prev) => {
      if (ids.includes(prev.contentType)) return prev
      return { ...prev, contentType: ids[0] }
    })
  }, [guidelinesHydrated, contentTypes, setFormState])

  const {
    phase,
    result,
    usage,
    guidelineVersion,
    policyVersion,
    contentTypeIdentity,
    error,
    failure,
    isBusy,
    isBlockedByOtherRun,
    hasCurrentDraft,
    canRetry,
    submitGeneration,
    retryGeneration,
    resetRun,
  } = useAiGenerationRun({ canGenerate, draftSession })
  const failureMessage = failure?.message || error
  const imageFailurePresentation = resolveImageFailurePresentation(failure)
  const canRetryFailure = Boolean(canRetry && formReady && failure?.retryable !== false)

  const handleSubmit = () => {
    submitGeneration(formState, selectedContentType?.definition, platforms)
  }

  const handleRetry = () => {
    retryGeneration()
  }

  useEffect(() => {
    if (phase !== 'completed' || !result) return
    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      resultRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [phase, result])

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Generar borradores
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Generado conforme a las guías activas. Requiere revisión humana antes de publicar.
      </p>

      {!formReady && !isBusy && (
        <p
          className="mb-4 text-sm text-gray-600 dark:text-gray-400"
          role="status"
          aria-live="polite"
        >
          Cargando opciones del generador...
        </p>
      )}

      {isBusy && (
        <div
          className="mb-4 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"
          data-testid="generation-polling"
          role="status"
          aria-live="polite"
        >
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
          <span>
            {phase === 'submitting' ? 'Iniciando generación...' : 'Generando borradores...'}
          </span>
        </div>
      )}

      <GenerationForm
        canGenerate={canGenerate}
        loading={!formReady}
        busy={isBusy || isBlockedByOtherRun}
        formState={formState}
        onFormChange={setFormState}
        onSubmit={handleSubmit}
        contentTypes={contentTypes}
        platforms={platforms}
        platformOptions={platformOptions}
      />

      {failureMessage && (phase === 'failed' || phase === 'timeout') && (
        <div className="mt-6">
          {imageFailurePresentation ? (
            <AssistedGenerationFailure
              failure={failure}
              error={error}
              presentation={imageFailurePresentation}
              canRetry={canRetryFailure}
              hasCurrentDraft={hasCurrentDraft}
              onRetry={handleRetry}
              onBack={resetRun}
            />
          ) : canRetryFailure ? (
            <ErrorState
              message={failureMessage}
              onRetry={handleRetry}
              actionLabel="Intentar de nuevo"
              onSecondaryAction={resetRun}
              secondaryActionLabel="Volver al formulario"
            />
          ) : (
            <ErrorState
              message={failureMessage}
              onRetry={resetRun}
              actionLabel="Volver al formulario"
            />
          )}
        </div>
      )}

      {result && phase === 'completed' && (
        <>
          <div ref={resultRef} tabIndex={-1} className="scroll-mt-6 outline-none">
            <GenerationResult
              result={result}
              usage={usage}
              guidelineVersion={guidelineVersion}
              policyVersion={policyVersion}
              contentTypeIdentity={contentTypeIdentity}
              platformLabels={platformLabels}
            />
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={resetRun}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline"
            >
              Nueva generación
            </button>
          </div>
        </>
      )}
    </div>
  )
}
