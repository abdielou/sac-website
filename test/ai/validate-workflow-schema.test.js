import {
  AiValidationResultSchema,
  buildFallbackResult,
} from '../../workflows/ai-social-media-designer/validation/validateAiWorkflow'

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
