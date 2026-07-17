import {
  AiValidationResultSchema,
  buildFallbackResult,
} from '../../workflows/ai-social-media-designer/validation/validateAiWorkflow'
import { extractOpenRouterUsage, mergeOpenRouterUsage } from '../../lib/ai-openrouter'

describe('validateAiWorkflow schema', () => {
  const baseInput = {
    platform: 'instagram',
    contentType: 'caption',
    draftText: 'Borrador de prueba',
  }

  test('buildFallbackResult always sets humanReviewRequired true', () => {
    const result = buildFallbackResult(baseInput, 'test reason')
    expect(result.humanReviewRequired).toBe(true)
    expect(result.overallOutcome).toBe('fail')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(AiValidationResultSchema.safeParse(result).success).toBe(true)
  })

  test('AiValidationResultSchema rejects humanReviewRequired false', () => {
    const invalid = {
      overallOutcome: 'pass',
      approvalRecommendation: 'ready_for_review',
      summary: 'ok',
      issues: [],
      humanReviewRequired: false,
    }
    expect(AiValidationResultSchema.safeParse(invalid).success).toBe(false)
  })

  test('AiValidationResultSchema accepts valid warning outcome', () => {
    const valid = {
      overallOutcome: 'warning',
      approvalRecommendation: 'needs_edits',
      summary: 'Falta información del evento.',
      issues: [
        {
          severity: 'major',
          category: 'completeness',
          message: 'Falta la hora del evento.',
          suggestedFix: 'Agregar hora.',
          affectedPlatform: 'facebook',
        },
      ],
      platformNotes: 'Revisar CTA.',
      humanReviewRequired: true,
    }
    expect(AiValidationResultSchema.safeParse(valid).success).toBe(true)
  })
})

describe('OpenRouter usage helpers', () => {
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

  test('extractOpenRouterUsage returns null without usage object', () => {
    expect(extractOpenRouterUsage({ id: 'gen-1' }, 'm')).toBeNull()
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
    expect(merged.completionTokens).toBe(11)
    expect(merged.totalTokens).toBe(33)
    expect(merged.cost).toEqual({ amount: 0.003, currency: 'USD' })
  })
})
