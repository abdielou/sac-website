'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import ValidationForm from '@/components/admin/ai/ValidationForm'
import ValidationResult from '@/components/admin/ai/ValidationResult'
import { useAiValidationRun } from '@/lib/hooks/useAiValidationRun'
import { useActiveGuidelines } from '@/lib/hooks/useActiveGuidelines'
import { useValidationDraft } from '@/lib/hooks/useValidationDraft'
import { resolveContentTypeOptions, resolvePlatformOptions } from '@/lib/ai-guidelines-draft'
import { ErrorState } from '@/components/admin/ErrorState'

export default function AiValidationClient() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canValidate = accessibleActions.includes('write_ai')

  const { active, hydrated: guidelinesHydrated } = useActiveGuidelines()
  const platforms = useMemo(() => resolvePlatformOptions(active), [active])
  const contentTypes = useMemo(() => resolveContentTypeOptions(active), [active])

  const {
    formState,
    setFormState,
    images,
    setImages,
    hydrated: draftHydrated,
  } = useValidationDraft()
  const formReady = guidelinesHydrated && draftHydrated

  const {
    phase,
    runId,
    result,
    usage,
    error,
    isBusy,
    copyFeedback,
    submitValidation,
    resetRun,
    showCopyFeedback,
  } = useAiValidationRun({ canValidate })

  const handleSubmit = () => {
    submitValidation(formState, images)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Validar publicación
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Revisa un borrador de redes sociales contra las guías de SAC antes de publicar manualmente.
      </p>

      <ValidationForm
        canValidate={canValidate}
        disabled={isBusy || !formReady}
        formState={formState}
        onFormChange={setFormState}
        images={images}
        onImagesChange={setImages}
        onSubmit={handleSubmit}
        platforms={platforms}
        contentTypes={contentTypes}
      />

      {isBusy && (
        <div
          className="mt-6 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"
          data-testid="validation-polling"
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
            {phase === 'submitting'
              ? 'Iniciando validación...'
              : `Validando borrador${runId ? ` (${runId.slice(0, 12)}…)` : ''}...`}
          </span>
        </div>
      )}

      {error && (phase === 'failed' || phase === 'timeout') && (
        <div className="mt-6">
          <ErrorState message={error} onRetry={resetRun} />
        </div>
      )}

      {copyFeedback && (
        <p className="mt-2 text-sm text-green-600 dark:text-green-400" role="status">
          {copyFeedback}
        </p>
      )}

      {result && phase === 'completed' && (
        <>
          <ValidationResult result={result} usage={usage} onCopyFeedback={showCopyFeedback} />
          <div className="mt-6">
            <button
              type="button"
              onClick={resetRun}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline"
            >
              Nueva validación
            </button>
          </div>
        </>
      )}
    </div>
  )
}
