'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import GenerationForm, { DEFAULT_GENERATION_FORM } from '@/components/admin/ai/GenerationForm'
import GenerationResult from '@/components/admin/ai/GenerationResult'
import { useAiGenerationRun } from '@/lib/hooks/useAiGenerationRun'
import { ErrorState } from '@/components/admin/ErrorState'

export default function AiGenerationClient() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canGenerate = accessibleActions.includes('write_ai')

  const [formState, setFormState] = useState(DEFAULT_GENERATION_FORM)

  const {
    phase,
    runId,
    result,
    usage,
    guidelineVersion,
    error,
    isBusy,
    copyFeedback,
    submitGeneration,
    resetRun,
    showCopyFeedback,
  } = useAiGenerationRun({ canGenerate })

  const handleSubmit = () => {
    submitGeneration(formState)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Generar borradores
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Crea borradores de texto en español para redes sociales según las guías de SAC. Los
        borradores son propuestas: valídalos y revísalos antes de publicar manualmente.
      </p>

      <GenerationForm
        canGenerate={canGenerate}
        disabled={isBusy}
        formState={formState}
        onFormChange={setFormState}
        onSubmit={handleSubmit}
      />

      {isBusy && (
        <div
          className="mt-6 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"
          data-testid="generation-polling"
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
              ? 'Iniciando generación...'
              : `Generando borradores${runId ? ` (${runId.slice(0, 12)}…)` : ''}...`}
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
          <GenerationResult
            result={result}
            usage={usage}
            guidelineVersion={guidelineVersion}
            onCopyFeedback={showCopyFeedback}
          />
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
