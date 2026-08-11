import {
  AiGenerationResultSchema,
  GenerateInputSchema,
  applyGenerationGuardrails,
  buildFallbackGenerationResult,
  buildProvidedPublicationResult,
  mergeImagePromptsIntoResult,
} from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'
import { GENERATION_INPUT_LIMITS } from '../../lib/ai-constants'
import { AI_BASE_POLICY_VERSION } from '../../lib/ai-agent'
import { legacyInputToContentData } from '../../lib/ai-content-data'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { resolveContentTypeDefinition } from '../../lib/ai-guidelines-schema'
import { extractOpenRouterUsage, mergeOpenRouterUsage } from '../../lib/ai-openrouter'

const guidelineDocument = getDefaultGuidelines()

function runtimeMetadata(input) {
  const definition = resolveContentTypeDefinition(guidelineDocument, input.contentType)
  return {
    contentData: legacyInputToContentData(input, definition),
    contentTypeDefinition: definition,
    contentTypeIdentity: {
      id: definition.id,
      label: definition.label,
      guidelineVersion: guidelineDocument.version,
    },
    guidelineVersion: guidelineDocument.version,
    policyVersion: AI_BASE_POLICY_VERSION,
  }
}

describe('generateAiWorkflow schema', () => {
  const basePayload = {
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
    backgroundMode: 'stock',
    backgroundId: 'telescope-nebula',
  }
  const baseInput = { ...basePayload, ...runtimeMetadata(basePayload) }

  test('buildFallbackGenerationResult always sets humanReviewRequired true', () => {
    const result = buildFallbackGenerationResult(baseInput, 'test reason')
    expect(result.humanReviewRequired).toBe(true)
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts.map((d) => d.platform)).toEqual(['instagram', 'facebook'])
    expect(new Set(result.drafts.map((d) => d.draftText)).size).toBe(1)
    expect(result.recommendedNextStep).toBeTruthy()
    expect(AiGenerationResultSchema.safeParse(result).success).toBe(true)
  })

  test('removes an invented free-admission claim before policy review', () => {
    const result = applyGenerationGuardrails(
      {
        caption: {
          contentType: baseInput.contentType,
          draftText: 'Acompáñanos a observar el cielo. Evento libre de costo para toda la familia.',
          assumptions: [],
          missingInformation: [],
        },
        recommendedNextStep: 'Validar antes de publicar.',
        humanReviewRequired: true,
      },
      baseInput
    )

    expect(result.drafts[0].draftText).toBe('Acompáñanos a observar el cielo.')
    expect(result.drafts[0].draftText).not.toMatch(/libre de costo/i)
  })

  test('preserves free admission when it was supplied as a known fact', () => {
    const result = applyGenerationGuardrails(
      {
        caption: {
          contentType: baseInput.contentType,
          draftText: 'Acompáñanos a observar el cielo. Evento libre de costo.',
          assumptions: [],
          missingInformation: [],
        },
        recommendedNextStep: 'Validar antes de publicar.',
        humanReviewRequired: true,
      },
      { ...baseInput, knownFacts: ['Evento libre de costo'] }
    )

    expect(result.drafts[0].draftText).toContain('Evento libre de costo')
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

  test('keeps the shared image prompt across the scoped package', () => {
    const definition = resolveContentTypeDefinition(guidelineDocument, 'regular_post')
    const textResult = {
      drafts: [
        {
          platform: 'x',
          contentType: 'regular_post',
          draftText: 'Texto para X.',
          imagePrompt: 'Prompt que el modelo de texto no debía adjuntar.',
        },
        {
          platform: 'instagram',
          contentType: 'regular_post',
          draftText: 'Texto para Instagram.',
        },
      ],
      recommendedNextStep: 'Validar',
      humanReviewRequired: true,
    }
    const result = mergeImagePromptsIntoResult(
      textResult,
      [
        { platform: 'x', imagePrompt: 'Prompt compartido' },
        { platform: 'instagram', imagePrompt: 'Prompt compartido' },
      ],
      {
        contentType: 'regular_post',
        platforms: ['x', 'instagram'],
        contentTypeDefinition: definition,
      }
    )

    expect(result.drafts.find(({ platform }) => platform === 'x').imagePrompt).toContain(
      'Prompt compartido'
    )
    expect(result.drafts.find(({ platform }) => platform === 'instagram').imagePrompt).toContain(
      'Prompt compartido'
    )
  })

  test('accepts an active custom content type instead of a static enum', () => {
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
      platforms: ['facebook'],
      contentType: definition.id,
      contentData: { intent: 'Compartir', topic: 'Primera observación' },
      contentTypeDefinition: definition,
      contentTypeIdentity: {
        id: definition.id,
        label: definition.label,
        guidelineVersion: 'guidelines-v12',
      },
      guidelineVersion: 'guidelines-v12',
      policyVersion: AI_BASE_POLICY_VERSION,
      intent: 'Compartir',
      topic: 'Primera observación',
    }

    expect(GenerateInputSchema.safeParse(input).success).toBe(true)
    expect(
      AiGenerationResultSchema.safeParse({
        drafts: [
          {
            platform: 'facebook',
            contentType: definition.id,
            draftText: 'Una historia de nuestra comunidad.',
          },
        ],
        recommendedNextStep: 'Validar antes de publicar.',
        humanReviewRequired: true,
      }).success
    ).toBe(true)
  })

  test('does not require eventDetails when a custom type only exposes optional event fields', () => {
    const definition = {
      id: 'community_update',
      label: 'Actualización comunitaria',
      status: 'active',
      fields: [
        { key: 'intent', label: 'Intención', required: true },
        { key: 'topic', label: 'Tema', required: true },
        { key: 'event_name', label: 'Nombre del evento', required: false },
      ],
      titleSource: 'topic',
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
      platforms: ['facebook'],
      contentType: definition.id,
      contentData: { intent: 'Informar', topic: 'Reunión del club' },
      contentTypeDefinition: definition,
      contentTypeIdentity: {
        id: definition.id,
        label: definition.label,
        guidelineVersion: 'guidelines-v12',
      },
      guidelineVersion: 'guidelines-v12',
      policyVersion: AI_BASE_POLICY_VERSION,
      intent: 'Informar',
      topic: 'Reunión del club',
    }

    expect(GenerateInputSchema.safeParse(input).success).toBe(true)
  })

  test('GenerateInputSchema rejects empty platforms', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      platforms: [],
    })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema accepts named platforms beyond the seed set', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      platforms: ['tiktok', 'threads'],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data.platforms).toEqual(['tiktok', 'threads'])
  })

  test('GenerateInputSchema rejects invalid platform ids', () => {
    const parsed = GenerateInputSchema.safeParse({
      ...baseInput,
      platforms: ['Bad Platform'],
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

  test('defaults to text_and_image and preserves provided publication text exactly', () => {
    const defaultMode = GenerateInputSchema.parse(baseInput)
    expect(defaultMode.generationMode).toBe('text_and_image')

    const publicationText = '  Texto existente\r\n\r\n#SinCambios  '
    const parsed = GenerateInputSchema.parse({
      ...baseInput,
      generationMode: 'image_only',
      publicationText,
    })
    const result = buildProvidedPublicationResult(parsed, guidelineDocument)

    expect(parsed.publicationText).toBe(publicationText)
    expect(result.publicationTextSource).toBe('provided')
    expect(result.drafts.every((draft) => draft.draftText === publicationText)).toBe(true)
  })

  test('requires a bounded publicationText and image-capable Guidelines for image_only', () => {
    expect(
      GenerateInputSchema.safeParse({ ...baseInput, generationMode: 'image_only' }).success
    ).toBe(false)
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        generationMode: 'image_only',
        publicationText: 'x'.repeat(20_001),
      }).success
    ).toBe(false)

    const noImageDefinition = {
      ...baseInput.contentTypeDefinition,
      visual: {
        mode: 'none',
        template: null,
        backgroundSources: [],
        sponsorAllowed: false,
        imagePolicyByPlatform: { instagram: 'prohibited', facebook: 'prohibited' },
      },
    }
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        generationMode: 'image_only',
        publicationText: 'Texto existente.',
        contentTypeDefinition: noImageDefinition,
        backgroundMode: undefined,
        backgroundId: undefined,
      }).success
    ).toBe(false)
  })

  test('GenerateInputSchema accepts internal run coordination without requiring it for legacy inputs', () => {
    expect(GenerateInputSchema.safeParse(baseInput).success).toBe(true)

    const coordinated = GenerateInputSchema.safeParse({
      ...baseInput,
      runCoordination: {
        claimId: 'claim-generation-1',
        coordination: 's3',
      },
    })
    expect(coordinated.success).toBe(true)
    expect(coordinated.data.runCoordination).toEqual({
      claimId: 'claim-generation-1',
      coordination: 's3',
    })

    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        runCoordination: { claimId: '', coordination: 's3' },
      }).success
    ).toBe(false)
    expect(
      GenerateInputSchema.safeParse({
        ...baseInput,
        runCoordination: { claimId: 'claim-generation-1', coordination: 'shared' },
      }).success
    ).toBe(false)
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
        contentType: 'holiday',
        ...runtimeMetadata({ ...baseInput, contentType: 'holiday' }),
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
    const input = {
      userId: 'user-1',
      userEmail: 'test@example.com',
      intent: 'Promover',
      topic: 'Evento',
      platforms: ['instagram'],
      contentType: 'event_promotion',
      eventDetails: { name: 'Solo nombre' },
    }
    const parsed = GenerateInputSchema.safeParse({ ...input, ...runtimeMetadata(input) })
    expect(parsed.success).toBe(false)
  })

  test('GenerateInputSchema preserves observation_night as a distinct event type', () => {
    const observationInput = {
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
      backgroundMode: 'stock',
      backgroundId: 'telescope-nebula',
    }
    const base = { ...observationInput, ...runtimeMetadata(observationInput) }

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
