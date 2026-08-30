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
  const { data: session, status: sessionStatus } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canValidate = accessibleActions.includes('write_ai')
  const draftPersistenceEnabled = sessionStatus
    ? sessionStatus === 'authenticated'
    : Boolean(session?.user)

  const { active, hydrated: guidelinesHydrated } = useActiveGuidelines()
  const platforms = useMemo(() => resolvePlatformOptions(active), [active])
  const contentTypes = useMemo(
    () => resolveContentTypeOptions(active, { includeDefinitions: true }),
    [active]
  )

  const {
    formState,
    setFormState,
    images,
    setImages,
    hydrated: draftHydrated,
    clearDraft,
    saveStatus: draftSaveStatus,
    updatedAt: draftUpdatedAt,
    restoreNotice: draftRestoreNotice,
  } = useValidationDraft({ user: session?.user, enabled: draftPersistenceEnabled })
  const formReady = guidelinesHydrated && draftHydrated
  const selectedContentType = contentTypes.find(({ id }) => id === formState.contentType)

  const {
    phase,
    runId,
    result,
    usage,
    guidelineVersion,
    policyVersion,
    contentTypeIdentity,
    error,
    isBusy,
    isBlockedByOtherRun,
    copyFeedback,
    submitValidation,
    resetRun,
    showCopyFeedback,
  } = useAiValidationRun({ canValidate })

  const handleSubmit = () => {
    submitValidation(
      formState,
      images,
      selectedContentType?.definition,
      platforms.map(({ id }) => id)
    )
  }

  const platformLabels = useMemo(
    () => Object.fromEntries(platforms.map(({ id, label }) => [id, label])),
    [platforms]
  )

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Validar publicación
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Revisa el texto y la imagen de la publicación como un solo paquete para las redes
        configuradas.
      </p>

      <ValidationForm
        canValidate={canValidate}
        disabled={isBusy || isBlockedByOtherRun || !formReady}
        formState={formState}
        onFormChange={setFormState}
        images={images}
        onImagesChange={setImages}
        onSubmit={handleSubmit}
        onClearDraft={clearDraft}
        draftSaveStatus={draftSaveStatus}
        draftUpdatedAt={draftUpdatedAt}
        draftRestoreNotice={draftRestoreNotice}
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
          <ValidationResult
            result={result}
            usage={usage}
            guidelineVersion={guidelineVersion}
            policyVersion={policyVersion}
            contentTypeIdentity={contentTypeIdentity}
            platformLabels={platformLabels}
            onCopyFeedback={showCopyFeedback}
          />
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
