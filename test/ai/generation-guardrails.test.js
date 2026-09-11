import {
  applyGenerationGuardrails,
  resolveSharedCaptionCharacterLimit,
  shouldIncludeHashtags,
} from '../../lib/ai-generation-guardrails'
import {
  AiGenerationResultSchema,
  AiSharedCaptionResultSchema,
} from '../../lib/ai-generation-schemas'
import {
  getActiveGuidelines,
  resolveGenerationGuidelinesFromDocument,
} from '../../lib/ai-guidelines'

describe('resolveGenerationGuidelinesFromDocument', () => {
  const originalBucket = process.env.S3_ARTICLES_BUCKET_NAME

  beforeAll(() => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
  })

  afterAll(() => {
    if (originalBucket === undefined) {
      delete process.env.S3_ARTICLES_BUCKET_NAME
    } else {
      process.env.S3_ARTICLES_BUCKET_NAME = originalBucket
    }
  })

  test('returns version and generation rules for known platform/content type', async () => {
    const active = await getActiveGuidelines()
    const resolved = resolveGenerationGuidelinesFromDocument(active, {
      platform: 'x',
      contentType: 'observation_night',
    })
    expect(resolved.version).toBe(active.version)
    expect(resolved.global).toMatch(/español/i)
    expect(resolved.global).toBe(active.global)
    expect(resolved.global).not.toContain('Usa los datos provistos')
    expect(resolved.captionMaxCharacters).toBe(280)
    expect(resolved.platform).not.toContain('280')
    expect(resolved.contentType).toContain('Observación')
    expect(resolved.prohibited).toBeTruthy()
  })

  test('uses generation-specific rules, not validation rules', async () => {
    const resolved = resolveGenerationGuidelinesFromDocument(await getActiveGuidelines(), {
      platform: 'instagram',
      contentType: 'post_educativo',
    })

    // Editable rules use plain language instead of internal validation categories.
    expect(resolved.contentType).not.toContain('uncertainty_factual_risk')
    expect(resolved.contentType).toContain('educativo')
  })

  test('keeps hashtag limits out of the global voice field', async () => {
    const active = await getActiveGuidelines()
    const document = {
      ...active,
      platforms: {
        ...active.platforms,
        instagram: 'No añadir hashtags por defecto.',
      },
    }
    const resolved = resolveGenerationGuidelinesFromDocument(document, {
      platform: 'instagram',
      contentType: 'post_educativo',
    })

    expect(resolved.global).not.toMatch(/hashtags/i)
    expect(resolved.platform).toContain('No añadir hashtags por defecto')
    expect(resolved.platform).not.toMatch(/3-5 hashtags/i)
  })

  test('falls back gracefully for unknown platform and content type', async () => {
    const resolved = resolveGenerationGuidelinesFromDocument(await getActiveGuidelines(), {
      platform: 'tiktok',
      contentType: 'unknown_type',
    })

    expect(resolved.version).toBeTruthy()
    expect(resolved.platform).toContain('Expectativas generales')
    expect(resolved.contentType).toContain('unknown_type')
  })
})

describe('shouldIncludeHashtags', () => {
  const input = {
    intent: 'Compartir una publicación educativa',
    topic: 'La Luna',
  }

  test('returns false for an ordinary publication', () => {
    expect(shouldIncludeHashtags(input, null)).toBe(false)
  })

  test('allows user-requested hashtags', () => {
    expect(shouldIncludeHashtags({ ...input, hashtags: ['#SAC'] }, null)).toBe(true)
  })

  test('allows an identifiable campaign', () => {
    expect(shouldIncludeHashtags({ ...input, topic: 'Campaña Cielos Oscuros 2026' }, null)).toBe(
      true
    )
  })

  test('allows hashtags explicitly required by active guidelines', () => {
    const guidelines = {
      platforms: {
        instagram: {
          platform: 'Para esta iniciativa se requiere incluir el hashtag oficial.',
        },
      },
    }

    expect(shouldIncludeHashtags(input, guidelines)).toBe(true)
  })
})

describe('applyGenerationGuardrails', () => {
  const eventDefinition = {
    id: 'event_promotion',
    label: 'Promoción de evento',
    fields: [
      { key: 'event_name', required: true },
      { key: 'date', required: true },
      { key: 'time', required: true },
      { key: 'location', required: true },
      { key: 'cta', required: true },
    ],
    titleSource: 'event_name',
    visual: { mode: 'template', template: 'event', imagePolicyByPlatform: {} },
  }
  const observationDefinition = {
    ...eventDefinition,
    id: 'observation_night',
    label: 'Noche de Observación',
    fields: eventDefinition.fields.map((field) =>
      field.key === 'cta' ? { ...field, required: false } : field
    ),
    titleSource: 'type_label',
  }
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

  test('clones one shared caption across every requested platform', () => {
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
    expect(new Set(result.drafts.map((d) => d.draftText)).size).toBe(1)
    const xDraft = result.drafts.find((d) => d.platform === 'x')
    expect(xDraft.draftText).toBe(result.drafts[0].draftText)
    expect(AiGenerationResultSchema.safeParse(result).success).toBe(true)
  })

  test('removes hashtags unless an exception allows them', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram', { draftText: 'Mira el cielo con nosotros. #Astronomía #SAC' })],
        recommendedNextStep: 'Validar antes de aprobar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    expect(result.drafts[0].draftText).toBe('Mira el cielo con nosotros.')
  })

  test('preserves hashtags when an exception allows them', () => {
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram', { draftText: 'Mira el cielo. #CielosOscuros' })],
        recommendedNextStep: 'Validar antes de aprobar.',
        humanReviewRequired: true,
      },
      baseInput,
      { allowHashtags: true }
    )

    expect(result.drafts[0].draftText).toContain('#CielosOscuros')
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
    expect(igDraft.missingInformation.some((item) => /aprobación oficial de SAC/i.test(item))).toBe(
      true
    )

    const xDraft = result.drafts.find((d) => d.platform === 'x')
    expect(xDraft.missingInformation).toEqual(igDraft.missingInformation)
  })

  test('event_promotion surfaces unprovided event details and CTA in missingInformation', () => {
    const input = {
      ...baseInput,
      platforms: ['facebook'],
      contentType: 'event_promotion',
      contentTypeDefinition: eventDefinition,
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

  test('observation_night retains its type while applying event guardrails', () => {
    const input = {
      ...baseInput,
      platforms: ['facebook'],
      contentType: 'observation_night',
      contentTypeDefinition: observationDefinition,
      eventDetails: {
        name: 'Noche de Observación',
        date: '2026-08-01',
        time: '20:00',
        location: 'Cabo Rojo',
      },
      cta: undefined,
    }

    const result = applyGenerationGuardrails(
      {
        drafts: [draft('facebook', { contentType: 'event_promotion' })],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      input
    )

    expect(result.drafts[0].contentType).toBe('observation_night')
    expect(result.drafts[0].missingInformation).toEqual([])
  })

  test('event_promotion does not duplicate missing details already listed by the model', () => {
    const input = {
      ...baseInput,
      platforms: ['facebook'],
      contentType: 'event_promotion',
      contentTypeDefinition: eventDefinition,
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

  test('flags a shared caption over the configured effective limit', () => {
    const longText = 'a'.repeat(300)
    const result = applyGenerationGuardrails(
      {
        drafts: [draft('instagram', { draftText: longText }), draft('x', { draftText: longText })],
        recommendedNextStep: 'Validar.',
        humanReviewRequired: true,
      },
      baseInput,
      { captionMaxCharacters: 280 }
    )

    const xDraft = result.drafts.find((d) => d.platform === 'x')
    expect(xDraft.missingInformation.some((item) => /280/.test(item))).toBe(true)

    const igDraft = result.drafts.find((d) => d.platform === 'instagram')
    expect(igDraft.missingInformation).toEqual(xDraft.missingInformation)
  })

  test('provider schema leaves the editorial character limit to Guidelines', () => {
    const result = {
      caption: {
        contentType: 'regular_post',
        draftText: 'a'.repeat(281),
        assumptions: [],
        missingInformation: [],
      },
      recommendedNextStep: 'Validar.',
      humanReviewRequired: true,
    }

    expect(AiSharedCaptionResultSchema.safeParse(result).success).toBe(true)
    result.caption.draftText = 'a'.repeat(20_001)
    expect(AiSharedCaptionResultSchema.safeParse(result).success).toBe(false)
  })

  test('uses the smallest configured limit for a shared caption and none when unspecified', () => {
    const guidelines = {
      platforms: {
        x: { captionMaxCharacters: 280 },
        instagram: { captionMaxCharacters: null },
        facebook: { captionMaxCharacters: 500 },
      },
    }

    expect(resolveSharedCaptionCharacterLimit(guidelines, ['x', 'instagram', 'facebook'])).toBe(280)
    expect(resolveSharedCaptionCharacterLimit(guidelines, ['instagram'])).toBeNull()
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
