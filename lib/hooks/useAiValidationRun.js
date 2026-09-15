'use client'

import { useCallback, useMemo, useState } from 'react'
import { contentTypeAcceptsImages } from '@/lib/ai-constants'
import { legacyInputToContentData } from '@/lib/ai-content-data'
import { resolveContentTypePlatforms } from '@/lib/ai-guidelines-schema'
import { AI_RUN_MODES, aiRunPhase, isAiRunBusy } from '@/lib/hooks/AiRunProvider'
import { useAiRunUrl } from '@/lib/hooks/useAiRunUrl'
import { buildEventDetails } from '@/lib/social-template/eventFormHelpers'

const LEGACY_POLICY_VERSION = 'legacy-unversioned'

function parseHashtags(value) {
  if (!value || !String(value).trim()) return undefined
  const list = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

function buildValidationFormData(formState, images, contentTypeDefinition, platforms) {
  const configuredPlatforms =
    Array.isArray(platforms) && platforms.length ? platforms : [formState.platform].filter(Boolean)
  const resolvedPlatforms = resolveContentTypePlatforms(contentTypeDefinition, configuredPlatforms)
  const formData = new FormData()
  formData.set('platforms', JSON.stringify(resolvedPlatforms))
  formData.set('contentType', formState.contentType)
  formData.set('draftText', formState.draftText)
  if (formState.goal?.trim()) formData.set('goal', formState.goal.trim())
  if (formState.audience?.trim()) formData.set('audience', formState.audience.trim())
  if (formState.cta?.trim()) formData.set('cta', formState.cta.trim())
  if (formState.altText?.trim()) formData.set('altText', formState.altText.trim())

  const hashtags = parseHashtags(formState.hashtags)
  if (hashtags) formData.set('hashtags', JSON.stringify(hashtags))

  const eventDetails = buildEventDetails(formState, contentTypeDefinition)
  if (eventDetails) formData.set('eventDetails', JSON.stringify(eventDetails))
  if (contentTypeDefinition) {
    const contentData = legacyInputToContentData(formState, contentTypeDefinition)
    if (
      !resolvedPlatforms.some((platform) =>
        contentTypeAcceptsImages(platform, formState.contentType, contentTypeDefinition)
      )
    ) {
      delete contentData.sponsor
    }
    formData.set('contentData', JSON.stringify(contentData))
  }

  if (
    resolvedPlatforms.some((platform) =>
      contentTypeAcceptsImages(platform, formState.contentType, contentTypeDefinition)
    )
  ) {
    for (const file of images) formData.append('images', file)
  }

  return formData
}

function normalizeValidationRunPayload(payload) {
  const wrapped =
    payload &&
    typeof payload === 'object' &&
    payload.result &&
    typeof payload.result === 'object' &&
    typeof payload.result.overallOutcome === 'string'

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

/** Validation projection over the admin-layout-owned AI run coordinator. */
export function useAiValidationRun({ canValidate }) {
  const [copyFeedback, setCopyFeedback] = useState(null)
  const { slot, startRun, resetRun, leaveCurrentUrl } = useAiRunUrl(AI_RUN_MODES.VALIDATE)
  const ownsSlot = slot.mode === AI_RUN_MODES.VALIDATE
  const phase = aiRunPhase(slot, AI_RUN_MODES.VALIDATE)
  const normalized = useMemo(
    () => normalizeValidationRunPayload(ownsSlot ? slot.payload : null),
    [ownsSlot, slot.payload]
  )
  const isBusy = ownsSlot && isAiRunBusy(slot)
  const isBlockedByOtherRun = !slot.hydrated || (!ownsSlot && isAiRunBusy(slot))

  const submitValidation = useCallback(
    async (formState, images, contentTypeDefinition, platforms) => {
      if (!canValidate || !slot.hydrated || isAiRunBusy(slot)) return
      leaveCurrentUrl()
      await startRun({
        mode: AI_RUN_MODES.VALIDATE,
        url: '/api/admin/ai/validate',
        body: buildValidationFormData(formState, images, contentTypeDefinition, platforms),
      })
    },
    [canValidate, leaveCurrentUrl, slot, startRun]
  )

  const resetValidation = useCallback(() => {
    leaveCurrentUrl()
    resetRun(AI_RUN_MODES.VALIDATE)
  }, [leaveCurrentUrl, resetRun])

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback('Copiado')
    window.setTimeout(() => setCopyFeedback(null), 2000)
  }, [])

  return {
    phase,
    runId: ownsSlot ? slot.runId : null,
    ...normalized,
    error: ownsSlot ? slot.error : null,
    coordination: ownsSlot ? slot.coordination : null,
    isBusy,
    isBlockedByOtherRun,
    copyFeedback,
    submitValidation,
    resetRun: resetValidation,
    showCopyFeedback,
  }
}
