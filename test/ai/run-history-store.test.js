import { buildUserKey, buildHistoryKey } from '../../lib/run-history-store'
import { buildValidationHistoryRecord } from '../../lib/ai-run-history'

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
      guidelineVersion: 'mvp-default-v1',
      model: 'openai/gpt-4o-mini',
    })

    expect(record.schemaVersion).toBe(1)
    expect(record.mode).toBe('validate')
    expect(record.runId).toBe('wrun_abc')
    expect(record.userKey).toBe(buildUserKey('session-user-1'))
    expect(record.validationOutcome).toBe('warning')
    expect(record.inputSummary.draftTextLength).toBeGreaterThan(0)
    expect(record.inputSummary.imageCount).toBe(1)
    expect(JSON.stringify(record)).not.toContain('data:image')
    expect(JSON.stringify(record)).not.toContain('Texto secreto')
    expect(record.durationMs).toBe(5000)
  })

  test('failed record includes safe error only', () => {
    const record = buildValidationHistoryRecord({
      input: { userId: 'u1', platform: 'x', contentType: 'regular_post', draftText: 'x' },
      runId: 'wrun_fail',
      status: 'failed',
      error: { message: 'Provider timeout', retryable: true },
      guidelineVersion: 'mvp-default-v1',
    })
    expect(record.status).toBe('failed')
    expect(record.error.message).toBe('Provider timeout')
    expect(record.error.retryable).toBe(true)
    expect(record.validationOutcome).toBeUndefined()
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
