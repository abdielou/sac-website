'use client'

import { useCallback, useMemo } from 'react'
import { AI_RUN_MODES, aiRunPhase, isAiRunBusy } from '@/lib/hooks/AiRunProvider'
import { useAiRunUrl } from '@/lib/hooks/useAiRunUrl'
import { buildGenerationPayload } from '@/lib/social-template/buildGenerationPayload'

export { buildGenerationPayload }

const LEGACY_POLICY_VERSION = 'legacy-unversioned'

export function normalizeGenerationRunPayload(payload) {
  const wrapped =
    payload &&
    typeof payload === 'object' &&
    payload.result &&
    typeof payload.result === 'object' &&
    Array.isArray(payload.result.drafts)

  if (wrapped) {
    return {
      result: payload.result,
      usage: payload.usage ?? null,
      guidelineVersion: payload.guidelineVersion ?? null,
      policyVersion: payload.policyVersion ?? LEGACY_POLICY_VERSION,
      contentTypeIdentity: payload.contentTypeIdentity ?? null,
    }
  }

  return {
    result: payload ?? null,
    usage: null,
    guidelineVersion: null,
    policyVersion: payload ? LEGACY_POLICY_VERSION : null,
    contentTypeIdentity: null,
  }
}

/** Generation projection over the admin-layout-owned AI run coordinator. */
export function useAiGenerationRun({ canGenerate, draftSession = null }) {
  const { slot, startRun, resetRun, leaveCurrentUrl } = useAiRunUrl(AI_RUN_MODES.GENERATE)
  const ownsSlot = slot.mode === AI_RUN_MODES.GENERATE
  const phase = aiRunPhase(slot, AI_RUN_MODES.GENERATE)
  const normalized = useMemo(
    () => normalizeGenerationRunPayload(ownsSlot ? slot.payload : null),
    [ownsSlot, slot.payload]
  )
  const isBusy = ownsSlot && isAiRunBusy(slot)
  const isBlockedByOtherRun = !slot.hydrated || (!ownsSlot && isAiRunBusy(slot))
  const failure = ownsSlot ? slot.failure : null
  const canRetry = Boolean(
    canGenerate &&
    ownsSlot &&
    slot.status === 'failed' &&
    slot.runId &&
    slot.sessionStarted === true &&
    slot.draftSession === draftSession &&
    slot.retryRequest &&
    failure?.retryable === true
  )

  const submitGeneration = useCallback(
    async (formState, contentTypeDefinition, platforms) => {
      if (!canGenerate || !slot.hydrated || isAiRunBusy(slot)) return
      leaveCurrentUrl()
      return startRun({
        mode: AI_RUN_MODES.GENERATE,
        url: '/api/admin/ai/generate',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGenerationPayload(formState, contentTypeDefinition, platforms)),
        draftSession,
      })
    },
    [canGenerate, draftSession, leaveCurrentUrl, slot, startRun]
  )

  const resetGeneration = useCallback(() => {
    leaveCurrentUrl()
    resetRun(AI_RUN_MODES.GENERATE)
  }, [leaveCurrentUrl, resetRun])

  const retryGeneration = useCallback(() => {
    if (!canRetry) return Promise.resolve({ started: false, reason: 'retry-unavailable' })
    // The snapshot was created only after GenerationForm accepted the original
    // submission. Reuse it verbatim so retry cannot bypass form validation.
    leaveCurrentUrl()
    return startRun(slot.retryRequest)
  }, [canRetry, leaveCurrentUrl, slot.retryRequest, startRun])

  return {
    phase,
    runId: ownsSlot ? slot.runId : null,
    ...normalized,
    error: ownsSlot ? slot.error : null,
    failure,
    coordination: ownsSlot ? slot.coordination : null,
    isBusy,
    isBlockedByOtherRun,
    canRetry,
    submitGeneration,
    retryGeneration,
    resetRun: resetGeneration,
  }
}
