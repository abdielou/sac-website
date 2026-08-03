'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import GenerationForm, { DEFAULT_GENERATION_FORM } from '@/components/admin/ai/GenerationForm'
import GenerationResult from '@/components/admin/ai/GenerationResult'
import { useAiGenerationRun } from '@/lib/hooks/useAiGenerationRun'
import { useActiveGuidelines } from '@/lib/hooks/useActiveGuidelines'
import { resolveContentTypeOptions, resolvePlatformOptions } from '@/lib/ai-guidelines-draft'
import { ErrorState } from '@/components/admin/ErrorState'

export default function AiGenerationClient() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canGenerate = accessibleActions.includes('write_ai')

  const { active, hydrated: guidelinesHydrated } = useActiveGuidelines()
  const contentTypes = useMemo(
    () => resolveContentTypeOptions(active, { includeDefinitions: true }),
    [active]
  )
  const platforms = useMemo(
    () => resolvePlatformOptions(active).map(({ id }) => id),
    [active]
  )

  const [formState, setFormState] = useState(DEFAULT_GENERATION_FORM)
  const selectedContentType = contentTypes.find(({ id }) => id === formState.contentType)
  const resultRef = useRef(null)

  useEffect(() => {
    if (!guidelinesHydrated || !contentTypes.length) return
    const ids = contentTypes.map((ct) => ct.id)
    setFormState((prev) => {
      if (ids.includes(prev.contentType)) return prev
      return { ...prev, contentType: ids[0] }
    })
  }, [guidelinesHydrated, contentTypes])

  const {
    phase,
    result,
    usage,
    guidelineVersion,
    policyVersion,
    contentTypeIdentity,
    error,
    isBusy,
    submitGeneration,
    retryRun,
    resetRun,
  } = useAiGenerationRun({ canGenerate })

  const handleSubmit = () => {
    submitGeneration(formState, selectedContentType?.definition, platforms)
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

      {!guidelinesHydrated && !isBusy && (
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
        loading={!guidelinesHydrated}
        busy={isBusy}
        formState={formState}
        onFormChange={setFormState}
        onSubmit={handleSubmit}
        contentTypes={contentTypes}
        platforms={platforms}
      />

      {error && (phase === 'failed' || phase === 'timeout') && (
        <div className="mt-6">
          <ErrorState
            message={error}
            onRetry={phase === 'timeout' ? retryRun : resetRun}
            actionLabel={phase === 'timeout' ? 'Consultar de nuevo' : 'Volver al formulario'}
          />
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
