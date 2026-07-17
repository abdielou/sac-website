import {
  applyGenerationGuardrails,
  AiGenerationResultSchema,
} from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'
import {
  getActiveGuidelines,
  resolveGenerationGuidelinesForRequest,
} from '../../lib/ai-guidelines'

describe('resolveGenerationGuidelinesForRequest', () => {
  test('returns version and generation rules for known platform/content type', () => {
    const resolved = resolveGenerationGuidelinesForRequest({
      platform: 'x',
      contentType: 'event_promotion',
    })

    expect(resolved.version).toBe(getActiveGuidelines().version)
    expect(resolved.global).toContain('Español')
    expect(resolved.platform).toContain('280')
    expect(resolved.contentType).toContain('evento')
    expect(resolved.prohibited).toBeTruthy()
  })

  test('uses generation-specific rules, not validation rules', () => {
    const resolved = resolveGenerationGuidelinesForRequest({
      platform: 'instagram',
      contentType: 'educational_astronomy',
    })

    // Validation rules talk about marking issues; generation rules talk about drafting.
    expect(resolved.contentType).not.toContain('uncertainty_factual_risk')
    expect(resolved.contentType).toContain('cautela factual')
  })

  test('falls back gracefully for unknown platform and content type', () => {
    const resolved = resolveGenerationGuidelinesForRequest({
      platform: 'tiktok',
      contentType: 'unknown_type',
    })

    expect(resolved.version).toBeTruthy()
    expect(resolved.platform).toContain('Reglas generales')
    expect(resolved.contentType).toContain('unknown_type')
  })
})

describe('applyGenerationGuardrails', () => {
  const baseInput = {
    userId: 'user-1',
    userEmail: 'test@example.com',
    intent: 'Promover observación',
    topic: 'Lluvia de meteoros',
    platforms: ['instagram', 'x'],
    contentType: 'regular_post',
  }

  const draft = (platform, overrides = {}) => ({
    platform,
    contentType: 'regular_post',
    draftText: 'Observación de meteoros con SAC este fin de semana.',
    assumptions: [],
    missingInformation: [],
    ...overrides,
  })

  test('produces exactly one draft per requested platform and forces humanReviewRequired', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram')],
        recommendedNextStep: 'Validar antes de aprobar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    expect(result.humanReviewRequired).toBe(true)
    expect(result.drafts.map((d) => d.platform)).toEqual(['instagram', 'x'])
    // Missing platform gets an explicit placeholder draft.
    const xDraft = result.drafts.find((d) => d.platform === 'x')
    expect(xDraft.draftText).toBe('')
    expect(xDraft.missingInformation).toContain('Borrador ausente; completar manualmente.')
    expect(AiGenerationResultSchema.safeParse(result).success).toBe(true)
  })

  test('drops drafts for platforms that were not requested', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram'), draft('x'), draft('facebook')],
        recommendedNextStep: 'Validar antes de aprobar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    expect(result.drafts.map((d) => d.platform)).toEqual(['instagram', 'x'])
  })

  test('normalizes missing assumptions/missingInformation to arrays and enforces contentType', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [
          {
            platform: 'instagram',
            contentType: 'caption',
            draftText: 'Texto',
          },
          draft('x'),
        ],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    const igDraft = result.drafts.find((d) => d.platform === 'instagram')
    expect(igDraft.assumptions).toEqual([])
    expect(igDraft.missingInformation).toEqual([])
    expect(igDraft.contentType).toBe('regular_post')
  })

  test('flags approval claims for human review', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [
          draft('instagram', {
            draftText: 'Evento aprobado oficialmente por SAC. ¡No te lo pierdas!',
          }),
          draft('x'),
        ],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    const igDraft = result.drafts.find((d) => d.platform === 'instagram')
    expect(
      igDraft.missingInformation.some((item) => /aprobación oficial de SAC/i.test(item))
    ).toBe(true)

    const xDraft = result.drafts.find((d) => d.platform === 'x')
    expect(xDraft.missingInformation).toEqual([])
  })

  test('event_promotion surfaces unprovided event details and CTA in missingInformation', () => {
    const input = {
      ...baseInput,
      platforms: ['facebook'],
      contentType: 'event_promotion',
      eventDetails: { name: 'Noche de observación', date: '2026-08-01' },
    }

    const result = applyGenerationGuardrails(
      {
        drafts: [
          draft('facebook', {
            contentType: 'event_promotion',
            draftText: 'Acompáñanos a la Noche de observación el 1 de agosto.',
          }),
        ],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      input
    )

    const fbDraft = result.drafts[0]
    expect(fbDraft.missingInformation.some((item) => /hora/i.test(item))).toBe(true)
    expect(fbDraft.missingInformation.some((item) => /lugar/i.test(item))).toBe(true)
    expect(fbDraft.missingInformation.some((item) => /cta/i.test(item))).toBe(true)
    // Provided details are not flagged.
    expect(fbDraft.missingInformation.some((item) => /nombre/i.test(item))).toBe(false)
    expect(fbDraft.missingInformation.some((item) => /fecha/i.test(item))).toBe(false)
  })

  test('event_promotion does not duplicate missing details already listed by the model', () => {
    const input = {
      ...baseInput,
      platforms: ['facebook'],
      contentType: 'event_promotion',
      eventDetails: {},
      cta: 'Regístrate en sociedadastronomia.com',
    }

    const result = applyGenerationGuardrails(
      {
        drafts: [
          draft('facebook', {
            contentType: 'event_promotion',
            missingInformation: ['Falta la hora del evento', 'Falta el lugar del evento'],
          }),
        ],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      input
    )

    const fbDraft = result.drafts[0]
    const hourMentions = fbDraft.missingInformation.filter((item) => /hora/i.test(item))
    expect(hourMentions).toHaveLength(1)
    // CTA was provided, so it is not flagged.
    expect(fbDraft.missingInformation.some((item) => /cta/i.test(item))).toBe(false)
  })

  test('flags X drafts over 280 characters', () => {
    const longText = 'a'.repeat(300)
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram', { draftText: longText }), draft('x', { draftText: longText })],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    const xDraft = result.drafts.find((d) => d.platform === 'x')
    expect(xDraft.missingInformation.some((item) => /280/.test(item))).toBe(true)

    // Only X is subject to the character limit.
    const igDraft = result.drafts.find((d) => d.platform === 'instagram')
    expect(igDraft.missingInformation).toEqual([])
  })

  test('fills recommendedNextStep when the model omits it', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram'), draft('x')],
        humanReviewRequired: true,
      },
      baseInput
    )

    expect(result.recommendedNextStep).toMatch(/validar/i)
  })
})
