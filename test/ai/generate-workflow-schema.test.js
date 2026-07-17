import {
  AiGenerationResultSchema,
  GenerateInputSchema,
  buildFallbackGenerationResult,
} from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'
import { extractOpenRouterUsage, mergeOpenRouterUsage } from '../../lib/ai-openrouter'

describe('generateAiWorkflow schema', () => {
  const baseInput = {
    userId: 'user-1',
    userEmail: 'test@example.com',
    intent: 'Promover observación',
    topic: 'Lluvia de meteoros',
    platforms: ['instagram', 'facebook'],
    contentType: 'event_promotion',
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

  test('AiGenerationResultSchema accepts valid multi-platform result', () => {
    const valid = {
      drafts: [
        {
          platform: 'instagram',
          contentType: 'event_promotion',
          draftText: 'Este sábado miramos el cielo con SAC...',
          rationale: 'Tono cercano sin inventar logística.',
          assumptions: ['El evento es presencial'],
          missingInformation: ['Hora y lugar exactos'],
          imagePrompt:
            'Family-friendly astronomy outreach; no identifiable faces, no official logo.',
          imageRationale: 'Apoya la promoción sin inventar detalles.',
        },
        {
          platform: 'x',
          contentType: 'event_promotion',
          draftText: 'Observación con SAC este sábado. Detalles pronto.',
          missingInformation: ['Hora', 'Lugar'],
        },
      ],
      recommendedNextStep: 'Validar los borradores antes de aprobar.',
      humanReviewRequired: true,
    }
    expect(AiGenerationResultSchema.safeParse(valid).success).toBe(true)
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
