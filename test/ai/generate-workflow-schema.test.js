import {
  AiGenerationResultSchema,
  GenerateInputSchema,
  buildFallbackGenerationResult,
} from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'
import { GENERATION_INPUT_LIMITS } from '../../lib/ai-constants'
import { extractOpenRouterUsage, mergeOpenRouterUsage } from '../../lib/ai-openrouter'

describe('generateAiWorkflow schema', () => {
  const baseInput = {
    userId: 'user-1',
    userEmail: 'test@example.com',
    intent: 'Promover observación',
    topic: 'Lluvia de meteoros',
    platforms: ['instagram', 'facebook'],
    contentType: 'event_promotion',
    cta: 'Confirma tu asistencia',
    eventDetails: {
      name: 'Noche de Observación',
      date: '2026-07-11',
      time: '19:15',
      location: 'Pitahaya, Cabo Rojo',
    },
  }

  test('buildFallbackGenerationResult always sets humanReviewRequired true', () => {
    const result = buildFallbackGenerationResult(baseInput, 'test reason')
    expect(result.humanReviewRequired).toBe(true)
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts.map((d) => d.platform)).toEqual(['instagram', 'facebook'])
    expect(result.recommendedNextStep).toBeTruthy()
    expect(AiGenerationResultSchema.safeParse(result).success).toBe(true)
  })

  test('AiGenerationResultSchema rejects humanReviewRequired false', () => {
    const invalid = {
      drafts: [
        {
          platform: 'x',
          contentType: 'regular_post',
          draftText: 'Hola',
        },
      ],
      recommendedNextStep: 'Validar antes de publicar.',
      humanReviewRequired: false,
    }
    expect(AiGenerationResultSchema.safeParse(invalid).success).toBe(false)
  })

  test('AiGenerationResultSchema accepts valid multi-platform result with shared prompt', () => {
    const sharedPrompt =
      'Family-friendly astronomy outreach; no identifiable faces, no official logo.'
    const valid = {
      drafts: [
        {
          platform: 'instagram',
          contentType: 'event_promotion',
          draftText: 'Este sábado miramos el cielo con SAC...',
          rationale: 'Tono cercano sin inventar logística.',
          assumptions: ['El evento es presencial'],
          missingInformation: ['Hora y lugar exactos'],
          imagePrompt: sharedPrompt,
          imageRationale: 'Apoya la promoción sin inventar detalles.',
        },
        {
          platform: 'x',
          contentType: 'event_promotion',
          draftText: 'Observación con SAC este sábado. Detalles pronto.',
          missingInformation: ['Hora', 'Lugar'],
          imagePrompt: sharedPrompt,
        },
      ],
      recommendedNextStep: 'Validar los borradores antes de aprobar.',
      humanReviewRequired: true,
    }
    expect(AiGenerationResultSchema.safeParse(valid).success).toBe(true)
    expect(valid.drafts[0].imagePrompt).toBe(valid.drafts[1].imagePrompt)
  })

  test('GenerateInputSchema rejects empty platforms', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      platforms: [],
    })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema rejects invalid platform', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      platforms: ['tiktok'],
    })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema accepts optional fields', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      tone: 'cercano',
      audience: 'familias',
      cta: 'Regístrate',
      knownFacts: ['Sábado 20:00'],
      imageStyle: 'ilustración',
      imageConstraints: 'sin rostros identificables',
    })
    expect(parsed.success).toBe(true)
  })

  test('GenerateInputSchema deduplicates platforms', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      platforms: ['instagram', 'instagram', 'facebook'],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data.platforms).toEqual(['instagram', 'facebook'])
  })

  test('GenerateInputSchema rejects an invalid calendar date', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      eventDetails: { ...baseInput.eventDetails, date: '2026-02-30' },
    })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema rejects an invalid 24-hour time', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      eventDetails: { ...baseInput.eventDetails, time: '25:99' },
    })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema requires event CTA and rejects unknown event fields', () => {
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        cta: undefined,
      }).success
    ).toBe(false)
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        eventDetails: { ...baseInput.eventDetails, privateNotes: 'no permitido' },
      }).success
    ).toBe(false)
  })

  test('GenerateInputSchema enforces input limits and template compatibility', () => {
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        topic: 'a'.repeat(GENERATION_INPUT_LIMITS.topic + 1),
      }).success
    ).toBe(false)
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        contentType: 'caption',
        backgroundMode: 'stock',
        backgroundId: 'telescope-nebula',
      }).success
    ).toBe(false)
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        backgroundMode: 'stock',
        backgroundId: 'does-not-exist',
      }).success
    ).toBe(false)
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        unexpected: true,
      }).success
    ).toBe(false)
  })

  test('AiGenerationResultSchema keeps template request and blobs paired at top level', () => {
    const baseResult = {
      drafts: [
        {
          platform: 'instagram',
          contentType: 'event_promotion',
          draftText: 'Acompáñanos a observar.',
        },
      ],
      recommendedNextStep: 'Validar',
      humanReviewRequired: true,
    }
    expect(
      AiGenerationResultSchema.safeParse({
        ...baseResult,
        templateRequest: {
          layout: 'event',
          textFields: { headline: 'Noche de Observación' },
        },
      }).success
    ).toBe(false)
    expect(
      AiGenerationResultSchema.safeParse({
        ...baseResult,
        templateRequest: {
          layout: 'event',
          textFields: { headline: 'Noche de Observación' },
        },
        templateAssets: {
          backgroundSource: {
            mode: 'stock',
            backgroundId: 'telescope-nebula',
          },
        },
      }).success
    ).toBe(true)
  })

  test('GenerateInputSchema rejects event_promotion without logistics', () => {
    const parsed = GenerateInputSchema.safeParse({
      userId: 'user-1',
      userEmail: 'test@example.com',
      intent: 'Promover',
      topic: 'Evento',
      platforms: ['instagram'],
      contentType: 'event_promotion',
      eventDetails: { name: 'Solo nombre' },
    })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema preserves observation_night as a distinct event type', () => {
    const base = {
      userId: 'user-1',
      userEmail: 'test@example.com',
      intent: 'Invitar al público',
      topic: 'Noche de Observación',
      platforms: ['instagram'],
      contentType: 'observation_night',
      cta: 'Confirma tu asistencia',
      eventDetails: {
        name: 'Noche de Observación',
        date: '2026-08-15',
        time: '19:30',
        location: 'Cabo Rojo',
      },
    }

    expect(GenerateInputSchema.safeParse(base).success).toBe(true)
    expect(GenerateInputSchema.safeParse({ ...base, cta: undefined }).success).toBe(true)
    expect(
      GenerateInputSchema.safeParse({
        ...base,
        eventDetails: { ...base.eventDetails, name: 'Promoción de evento' },
      }).success
    ).toBe(false)
  })
})

describe('OpenRouter usage helpers (shared)', () => {
  test('extractOpenRouterUsage maps cost and tokens', () => {
    const usage = extractOpenRouterUsage(
      {
        id: 'gen-xyz',
        model: 'openai/gpt-4o-mini',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          cost: 0.0012,
        },
      },
      'fallback-model'
    )

    expect(usage).toEqual({
      openRouterGenerationId: 'gen-xyz',
      model: 'openai/gpt-4o-mini',
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      cost: { amount: 0.0012, currency: 'USD' },
    })
  })

  test('mergeOpenRouterUsage sums costs across retries', () => {
    const merged = mergeOpenRouterUsage(
      {
        openRouterGenerationId: 'gen-1',
        model: 'openai/gpt-4o-mini',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cost: { amount: 0.001, currency: 'USD' },
      },
      {
        openRouterGenerationId: 'gen-2',
        model: 'openai/gpt-4o-mini',
        promptTokens: 12,
        completionTokens: 6,
        totalTokens: 18,
        cost: { amount: 0.002, currency: 'USD' },
      }
    )

    expect(merged.openRouterGenerationId).toBe('gen-2')
    expect(merged.promptTokens).toBe(22)
    expect(merged.cost).toEqual({ amount: 0.003, currency: 'USD' })
  })
})
