'use client'

import { useEffect, useMemo, useState } from 'react'
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
  const platforms = useMemo(
    () => resolvePlatformOptions(active, { generationOnly: true }),
    [active]
  )
  const contentTypes = useMemo(() => resolveContentTypeOptions(active), [active])

  const [formState, setFormState] = useState(DEFAULT_GENERATION_FORM)

  useEffect(() => {
    if (!guidelinesHydrated || !platforms.length) return
    const ids = platforms.map((p) => p.id)
    const nextPlatforms = formState.platforms.filter((id) => ids.includes(id))
    if (nextPlatforms.length === formState.platforms.length) return
    setFormState((prev) => ({
      ...prev,
      platforms: nextPlatforms.length ? nextPlatforms : [ids[0]],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when guideline platforms change
  }, [guidelinesHydrated, platforms])

  useEffect(() => {
    if (!guidelinesHydrated || !contentTypes.length) return
    const ids = contentTypes.map((ct) => ct.id)
    if (ids.includes(formState.contentType)) return
    setFormState((prev) => ({ ...prev, contentType: ids[0] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when guideline content types change
  }, [guidelinesHydrated, contentTypes])

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
        disabled={isBusy || !guidelinesHydrated}
        formState={formState}
        onFormChange={setFormState}
        onSubmit={handleSubmit}
        platforms={platforms}
        contentTypes={contentTypes}
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
