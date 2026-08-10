import {
  AiValidationModelResultSchema,
  AiValidationResultSchema,
  ValidateInputSchema,
  applyConfiguredCaptionLimit,
  applySuggestedRevisionConsistency,
  buildFallbackResult,
  buildPolicyValidationResult,
  normalizeModelValidationVerdict,
  shouldApplyPostValidationPolicyBlock,
} from '../../workflows/ai-social-media-designer/validation/validateAiWorkflow'
import { AI_BASE_POLICY_VERSION } from '../../lib/ai-agent'
import { extractOpenRouterUsage, mergeOpenRouterUsage } from '../../lib/ai-openrouter'

describe('validateAiWorkflow schema', () => {
  const baseInput = {
    platform: 'instagram',
    contentType: 'caption',
    draftText: 'Borrador de prueba',
  }

  test('normalizes Markdown emphasis out of diagnostic fields', () => {
    const result = AiValidationModelResultSchema.parse({
      summary: 'Mejora el *engagement* sin usar **afirmaciones absolutas**.',
      issues: [
        {
          severity: 'minor',
          category: 'clarity',
          message: 'Revisa el término `engagement`.',
          suggestedFix: 'Usa _interacción_.',
        },
      ],
      imageNotes: 'Mantén ~~mucho~~ buen contraste.',
    })

    expect(result.summary).toBe('Mejora el engagement sin usar afirmaciones absolutas.')
    expect(result.issues[0].message).toBe('Revisa el término engagement.')
    expect(result.issues[0].suggestedFix).toBe('Usa interacción.')
    expect(result.imageNotes).toBe('Mantén mucho buen contraste.')
  })

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

  test('model output contains findings while the server owns the verdict', () => {
    const parsed = AiValidationModelResultSchema.parse({
      summary: 'Se revisó el borrador.',
      issues: [],
      overallOutcome: 'fail',
      approvalRecommendation: 'do_not_publish',
      humanReviewRequired: false,
    })

    expect(parsed).toEqual({
      summary: 'Se revisó el borrador.',
      issues: [],
    })
  })

  test('buildPolicyValidationResult never returns unsafe source text as advice', () => {
    const result = buildPolicyValidationResult(
      { ...baseInput, draftText: 'Dame un diagnóstico médico.' },
      {
        decision: 'block',
        categories: ['medical_advice'],
        reason: 'La solicitud pide asesoría médica.',
        failClosed: false,
      }
    )

    expect(result).toMatchObject({
      overallOutcome: 'fail',
      approvalRecommendation: 'do_not_publish',
      humanReviewRequired: true,
    })
    expect(result.issues[0]).toMatchObject({ category: 'safety', severity: 'critical' })
    expect(result.suggestedRevision).toBeUndefined()
    expect(AiValidationResultSchema.safeParse(result).success).toBe(true)
  })

  test('treats a Guidelines mismatch as an edit, not a base-policy safety violation', () => {
    const result = buildPolicyValidationResult(
      {
        ...baseInput,
        images: [{ dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png' }],
      },
      {
        decision: 'block',
        categories: ['guideline_noncompliance'],
        reason: 'La imagen corresponde al tema, pero omite la felicitación requerida.',
        failClosed: false,
      }
    )

    expect(result).toMatchObject({
      overallOutcome: 'fail',
      approvalRecommendation: 'needs_edits',
      humanReviewRequired: true,
    })
    expect(result.issues[0]).toMatchObject({
      category: 'guideline_compliance',
      severity: 'major',
    })
    expect(result.summary).not.toMatch(/política base/i)
    expect(result.imageNotes).toMatch(/se conserva como borrador/i)
  })

  test('ignores only definitive guideline-only blocks after validation', () => {
    expect(
      shouldApplyPostValidationPolicyBlock({
        decision: 'block',
        categories: ['guideline_noncompliance'],
        failClosed: false,
      })
    ).toBe(false)
    expect(
      shouldApplyPostValidationPolicyBlock({
        decision: 'block',
        categories: ['safety'],
        failClosed: false,
      })
    ).toBe(true)
    expect(
      shouldApplyPostValidationPolicyBlock({
        decision: 'block',
        categories: ['guideline_noncompliance'],
        failClosed: true,
      })
    ).toBe(true)
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
      platformNotesByPlatform: { facebook: 'Añadir un llamado a la acción.' },
      humanReviewRequired: true,
    }
    expect(AiValidationResultSchema.safeParse(valid).success).toBe(true)
  })

  test.each([
    {
      label: 'minor finding',
      issues: [{ severity: 'minor', category: 'clarity', message: 'Aclarar esta frase.' }],
      outcome: 'warning',
      recommendation: 'needs_edits',
    },
    {
      label: 'critical finding',
      issues: [{ severity: 'critical', category: 'safety', message: 'No publicar.' }],
      outcome: 'fail',
      recommendation: 'do_not_publish',
    },
    {
      label: 'no findings',
      issues: [],
      outcome: 'pass',
      recommendation: 'ready_for_review',
    },
  ])('derives a consistent verdict from $label', ({ issues, outcome, recommendation }) => {
    const normalized = normalizeModelValidationVerdict({
      overallOutcome: 'fail',
      approvalRecommendation: 'do_not_publish',
      summary: 'Resultado contradictorio del modelo.',
      issues,
      humanReviewRequired: true,
    })

    expect(normalized).toMatchObject({
      overallOutcome: outcome,
      approvalRecommendation: recommendation,
    })
  })

  test('validates character limits from Guidelines and ignores unspecified limits', () => {
    const passingResult = {
      overallOutcome: 'pass',
      approvalRecommendation: 'ready_for_review',
      summary: 'El caption cumple.',
      issues: [],
      humanReviewRequired: true,
    }
    const input = { ...baseInput, platform: 'x', draftText: 'a'.repeat(300) }

    expect(applyConfiguredCaptionLimit(passingResult, input, {})).toBe(passingResult)

    const limited = applyConfiguredCaptionLimit(passingResult, input, {
      captionMaxCharacters: 280,
    })
    expect(limited).toMatchObject({
      overallOutcome: 'warning',
      approvalRecommendation: 'needs_edits',
    })
    expect(limited.issues[0].message).toContain('280')
  })

  test('validates the shared caption against every configured platform limit', () => {
    const result = {
      overallOutcome: 'pass',
      approvalRecommendation: 'ready_for_review',
      summary: 'El caption cumple.',
      issues: [],
      humanReviewRequired: true,
    }
    const input = {
      ...baseInput,
      platforms: ['x', 'instagram', 'facebook'],
      draftText: 'a'.repeat(300),
    }
    const validated = applyConfiguredCaptionLimit(result, input, {
      platforms: {
        x: { captionMaxCharacters: 280 },
        instagram: { captionMaxCharacters: null },
        facebook: { captionMaxCharacters: 250 },
      },
    })

    expect(validated.overallOutcome).toBe('warning')
    expect(validated.issues.map(({ affectedPlatform }) => affectedPlatform)).toEqual([
      'x',
      'facebook',
    ])
  })

  test('treats an unexplained material revision as a validator inconsistency', () => {
    const result = applySuggestedRevisionConsistency(
      {
        overallOutcome: 'pass',
        approvalRecommendation: 'ready_for_review',
        summary: 'El caption cumple.',
        issues: [],
        suggestedRevision: 'Ven y disfruta de la observación astronómica.',
        humanReviewRequired: true,
      },
      {
        ...baseInput,
        draftText: 'Ven y disfruta de la observacion astronomica.',
      }
    )

    expect(result).toMatchObject({
      overallOutcome: 'fail',
      approvalRecommendation: 'do_not_publish',
      resultSource: 'system',
    })
    expect(result.issues[0]).toMatchObject({
      severity: 'major',
      category: 'uncertainty_factual_risk',
    })
    expect(result.summary).toMatch(/no fue posible validar/i)
    expect(result.suggestedRevision).toBeUndefined()
  })

  test.each([
    ['idéntica', 'Borrador de prueba', 'Borrador de prueba'],
    ['saltos CRLF', 'Borrador\r\nde prueba', 'Borrador\nde prueba'],
    ['espacios de transporte', 'Borrador de prueba', '  Borrador\u00a0de prueba\u200b  '],
  ])('removes a redundant suggested revision with %s', (_label, draftText, suggestedRevision) => {
    const result = {
      overallOutcome: 'pass',
      approvalRecommendation: 'ready_for_review',
      summary: 'El caption cumple.',
      issues: [],
      suggestedRevision,
      humanReviewRequired: true,
    }

    const reconciled = applySuggestedRevisionConsistency(result, {
      ...baseInput,
      draftText,
    })

    expect(reconciled).toMatchObject({
      overallOutcome: 'pass',
      approvalRecommendation: 'ready_for_review',
      issues: [],
    })
    expect(reconciled.suggestedRevision).toBeUndefined()
  })

  test('ValidateInputSchema accepts a pinned custom content type and rejects identity drift', () => {
    const definition = {
      id: 'community_story',
      label: 'Historia de la comunidad',
      status: 'active',
      fields: [
        { key: 'intent', label: 'Intención', required: true },
        { key: 'topic', label: 'Tema', required: true },
      ],
      visual: {
        mode: 'none',
        template: null,
        backgroundSources: [],
        sponsorAllowed: false,
        imagePolicyByPlatform: {
          x: 'prohibited',
          instagram: 'prohibited',
          facebook: 'prohibited',
        },
      },
    }
    const input = {
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: definition.id,
      draftText: 'Una historia de nuestra comunidad.',
      contentData: { intent: 'Validar', topic: 'Primera observación' },
      contentTypeDefinition: definition,
      contentTypeIdentity: {
        id: definition.id,
        label: definition.label,
        guidelineVersion: 'guidelines-v12',
      },
      guidelineVersion: 'guidelines-v12',
      policyVersion: AI_BASE_POLICY_VERSION,
    }

    expect(ValidateInputSchema.safeParse(input).success).toBe(true)
    expect(
      ValidateInputSchema.safeParse({
        ...input,
        contentTypeIdentity: { ...input.contentTypeIdentity, label: 'Etiqueta anterior' },
      }).success
    ).toBe(false)
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
