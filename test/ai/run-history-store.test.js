import { buildUserKey, buildHistoryKey } from '../../lib/run-history-store'
import {
  buildValidationHistoryRecord,
  buildGenerationHistoryRecord,
  normalizeRunHistoryRecord,
} from '../../lib/ai-run-history'

describe('run-history-store', () => {
  test('buildUserKey returns opaque 16-char hex (not email)', () => {
    const key = buildUserKey('user-abc-123')
    expect(key).toHaveLength(16)
    expect(key).toMatch(/^[a-f0-9]+$/)
    expect(key).not.toContain('@')
    expect(buildUserKey('user-abc-123')).toBe(key)
  })

  test('buildHistoryKey follows workflow-runs prefix pattern', () => {
    const key = buildHistoryKey({
      userKey: 'abcd1234ef567890',
      runId: 'wrun_test123',
      completedAt: '2026-07-10T12:00:00.000Z',
    })
    expect(key).toMatch(
      /^workflow-runs\/abcd1234ef567890\/2026\/07\/10\/\d{8}T\d{6}\.\d{3}Z-wrun_test123\.json$/
    )
  })
})

describe('buildValidationHistoryRecord', () => {
  test('produces sparse record without draft text or images', () => {
    const record = buildValidationHistoryRecord({
      input: {
        userId: 'session-user-1',
        platform: 'instagram',
        contentType: 'caption',
        draftText: 'Texto secreto del borrador que no debe persistirse completo',
        images: [{ dataUrl: 'data:image/png;base64,SECRET' }],
      },
      runId: 'wrun_abc',
      status: 'completed',
      result: {
        overallOutcome: 'warning',
        approvalRecommendation: 'needs_edits',
        issues: [{ severity: 'major', category: 'clarity', message: 'test' }],
      },
      startedAt: '2026-07-10T12:00:00.000Z',
      completedAt: '2026-07-10T12:00:05.000Z',
      guidelineVersion: 'v2',
      policyVersion: 'sac-social-policy-v1',
      contentTypeIdentity: {
        id: 'caption',
        label: 'Caption',
        guidelineVersion: 'v2',
        prompt: 'No persistir este prompt',
      },
      model: 'openai/gpt-4o-mini',
    })

    expect(record.schemaVersion).toBe(2)
    expect(record.mode).toBe('validate')
    expect(record.runId).toBe('wrun_abc')
    expect(record.userKey).toBe(buildUserKey('session-user-1'))
    expect(record.guidelineVersion).toBe('v2')
    expect(record.policyVersion).toBe('sac-social-policy-v1')
    expect(record.contentTypeIdentity).toEqual({
      id: 'caption',
      label: 'Caption',
      guidelineVersion: 'v2',
    })
    expect(record.validationOutcome).toBe('warning')
    expect(record.inputSummary.draftTextLength).toBeGreaterThan(0)
    expect(record.inputSummary.imageCount).toBe(1)
    expect(JSON.stringify(record)).not.toContain('data:image')
    expect(JSON.stringify(record)).not.toContain('Texto secreto')
    expect(JSON.stringify(record)).not.toContain('No persistir este prompt')
    expect(record.durationMs).toBe(5000)
  })

  test('failed record includes safe error only', () => {
    const record = buildValidationHistoryRecord({
      input: { userId: 'u1', platform: 'x', contentType: 'regular_post', draftText: 'x' },
      runId: 'wrun_fail',
      status: 'failed',
      error: { message: 'Provider timeout', retryable: true },
      guidelineVersion: 'default-v1',
    })
    expect(record.status).toBe('failed')
    expect(record.error.message).toBe('Provider timeout')
    expect(record.error.retryable).toBe(true)
    expect(record.validationOutcome).toBeUndefined()
    expect(record.policyVersion).toBe('legacy-unversioned')
    expect(record.contentTypeIdentity).toBe('legacy-unversioned')
  })

  test('marks explicitly legacy validation runs without inventing current versions', () => {
    const record = buildValidationHistoryRecord({
      input: { userId: 'u1', platform: 'x', contentType: 'regular_post', draftText: 'x' },
      runId: 'wrun_legacy_validation',
      status: 'completed',
      legacy: true,
    })

    expect(record.guidelineVersion).toBeUndefined()
    expect(record.policyVersion).toBe('legacy-unversioned')
    expect(record.contentTypeIdentity).toBe('legacy-unversioned')
  })

  test('includes OpenRouter usage fields when provided', () => {
    const record = buildValidationHistoryRecord({
      input: { userId: 'u1', platform: 'instagram', contentType: 'caption', draftText: 'hola' },
      runId: 'wrun_cost',
      status: 'completed',
      result: {
        overallOutcome: 'pass',
        approvalRecommendation: 'ready_for_review',
        issues: [],
      },
      model: 'openai/gpt-4o-mini',
      usage: {
        openRouterGenerationId: 'gen-abc123',
        model: 'openai/gpt-4o-mini',
        promptTokens: 194,
        completionTokens: 50,
        totalTokens: 244,
        cost: { amount: 0.0065, currency: 'USD' },
      },
    })

    expect(record.openRouterGenerationId).toBe('gen-abc123')
    expect(record.promptTokens).toBe(194)
    expect(record.completionTokens).toBe(50)
    expect(record.totalTokens).toBe(244)
    expect(record.cost).toEqual({ amount: 0.0065, currency: 'USD' })
    expect(record.model).toBe('openai/gpt-4o-mini')
  })
})

describe('buildGenerationHistoryRecord', () => {
  test('produces sparse record without intent/topic/draft text', () => {
    const secretIntent = 'Intent secreta que no debe persistirse'
    const secretTopic = 'Topic secreto con detalles internos'
    const record = buildGenerationHistoryRecord({
      input: {
        userId: 'session-user-1',
        platforms: ['instagram', 'facebook'],
        contentType: 'event_promotion',
        intent: secretIntent,
        topic: secretTopic,
        tone: 'cercano',
        knownFacts: ['fecha no publicada'],
      },
      runId: 'wrun_gen_abc',
      status: 'completed',
      result: {
        drafts: [
          {
            platform: 'instagram',
            contentType: 'event_promotion',
            draftText: 'Borrador secreto completo que no debe ir al historial',
            missingInformation: ['hora'],
          },
          {
            platform: 'facebook',
            contentType: 'event_promotion',
            draftText: 'Otro borrador secreto',
            missingInformation: [],
          },
        ],
        recommendedNextStep: 'Validar antes de publicar.',
        humanReviewRequired: true,
      },
      startedAt: '2026-07-10T12:00:00.000Z',
      completedAt: '2026-07-10T12:00:08.000Z',
      guidelineVersion: 'v2',
      policyVersion: 'sac-social-policy-v1',
      contentTypeIdentity: {
        id: 'event_promotion',
        label: 'Promoción de evento',
        guidelineVersion: 'v2',
      },
      model: 'openai/gpt-4o-mini',
    })

    expect(record.schemaVersion).toBe(2)
    expect(record.mode).toBe('generate')
    expect(record.runId).toBe('wrun_gen_abc')
    expect(record.userKey).toBe(buildUserKey('session-user-1'))
    expect(record.guidelineVersion).toBe('v2')
    expect(record.policyVersion).toBe('sac-social-policy-v1')
    expect(record.contentTypeIdentity).toEqual({
      id: 'event_promotion',
      label: 'Promoción de evento',
      guidelineVersion: 'v2',
    })
    expect(record.platform).toBeUndefined()
    expect(record.contentType).toBe('event_promotion')
    expect(record.inputSummary.platforms).toEqual(['instagram', 'facebook'])
    expect(record.inputSummary.intentLength).toBe(secretIntent.length)
    expect(record.inputSummary.topicLength).toBe(secretTopic.length)
    expect(record.inputSummary.hasTone).toBe(true)
    expect(record.inputSummary.hasKnownFacts).toBe(true)
    expect(record.outcomeSummary).toEqual({
      draftCount: 2,
      platforms: ['instagram', 'facebook'],
      hasMissingInformation: true,
    })
    expect(record.durationMs).toBe(8000)
    expect(JSON.stringify(record)).not.toContain(secretIntent)
    expect(JSON.stringify(record)).not.toContain(secretTopic)
    expect(JSON.stringify(record)).not.toContain('Borrador secreto')
  })

  test('counts replicated compatibility drafts as one logical caption', () => {
    const sharedCaption = 'Un solo caption para todas las redes.'
    const record = buildGenerationHistoryRecord({
      input: {
        userId: 'u1',
        platforms: ['x', 'instagram', 'facebook'],
        contentType: 'regular_post',
        intent: 'Informar',
        topic: 'Astronomía',
      },
      runId: 'wrun_shared',
      status: 'completed',
      result: {
        drafts: ['x', 'instagram', 'facebook'].map((platform) => ({
          platform,
          contentType: 'regular_post',
          draftText: sharedCaption,
          missingInformation: [],
        })),
      },
    })

    expect(record.inputSummary.platforms).toEqual(['x', 'instagram', 'facebook'])
    expect(record.outcomeSummary).toEqual({
      draftCount: 1,
      platforms: ['x', 'instagram', 'facebook'],
      hasMissingInformation: false,
    })
  })

  test('single-platform sets platform field; failed includes safe error', () => {
    const record = buildGenerationHistoryRecord({
      input: {
        userId: 'u1',
        platforms: ['x'],
        contentType: 'regular_post',
        intent: 'hola',
        topic: 'mundo',
      },
      runId: 'wrun_gen_fail',
      status: 'failed',
      error: { message: 'Provider timeout', retryable: true },
      guidelineVersion: 'default-v1',
    })

    expect(record.platform).toBe('x')
    expect(record.status).toBe('failed')
    expect(record.error.message).toBe('Provider timeout')
    expect(record.error.retryable).toBe(true)
    expect(record.outcomeSummary).toBeUndefined()
    expect(record.policyVersion).toBe('legacy-unversioned')
    expect(record.contentTypeIdentity).toBe('legacy-unversioned')
  })

  test('marks explicitly legacy generation runs without inventing current versions', () => {
    const record = buildGenerationHistoryRecord({
      input: {
        userId: 'u1',
        platforms: ['facebook'],
        contentType: 'member_update',
        intent: 'hola',
        topic: 'mundo',
      },
      runId: 'wrun_legacy_generation',
      status: 'completed',
      legacy: true,
    })

    expect(record.guidelineVersion).toBeUndefined()
    expect(record.policyVersion).toBe('legacy-unversioned')
    expect(record.contentTypeIdentity).toBe('legacy-unversioned')
  })

  test('projects immutable v1 history with explicit unversioned markers at read time', () => {
    const legacyRecord = {
      schemaVersion: 1,
      runId: 'wrun_old',
      mode: 'generate',
      contentType: 'caption',
    }

    expect(normalizeRunHistoryRecord(legacyRecord)).toEqual({
      ...legacyRecord,
      policyVersion: 'legacy-unversioned',
      contentTypeIdentity: 'legacy-unversioned',
    })
    expect(legacyRecord).not.toHaveProperty('policyVersion')
  })
})
