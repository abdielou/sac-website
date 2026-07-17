import {
  applyImageAssetFallbackToDraft,
  buildGeneratedImageAsset,
  checkImageGenerationSpendCeiling,
  extractOpenRouterImageUsage,
  getImageGenerationConfig,
  parseOpenRouterImageResponse,
  recordImageGenerationSpend,
  resetImageGenerationSpendForTests,
  resolveImageGenerationGate,
} from '../../lib/ai-image-generation'
import {
  AiGeneratedImageSchema,
  AiGenerationResultSchema,
} from '../../workflows/ai-social-media-designer/generation/generateAiWorkflow'

describe('getImageGenerationConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('always uses download-only retention (not env-toggled)', () => {
    process.env.AI_IMAGE_GENERATION_RETENTION = 's3'
    const config = getImageGenerationConfig()
    expect(config.retention).toBe('download-only')
  })

  test('reads model and optional spend limits from env', () => {
    process.env.OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-image'
    process.env.AI_IMAGE_GENERATION_MAX_COST_PER_RUN_USD = '1.25'
    process.env.AI_IMAGE_GENERATION_SPEND_CEILING_USD = '10'

    const config = getImageGenerationConfig()
    expect(config.model).toBe('google/gemini-3.1-flash-lite-image')
    expect(config.maxCostPerRunUsd).toBe(1.25)
    expect(config.spendCeilingUsd).toBe(10)
  })

  test('uses OPENROUTER_MODEL (no separate image model)', () => {
    process.env.OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-image'
    delete process.env.OPENROUTER_IMAGE_MODEL
    expect(getImageGenerationConfig().model).toBe('google/gemini-3.1-flash-lite-image')
  })

  test('ignores legacy enable/rights env flags', () => {
    process.env.AI_IMAGE_GENERATION_ENABLED = 'false'
    process.env.AI_IMAGE_GENERATION_RIGHTS_ACKNOWLEDGED = 'false'
    process.env.OPENROUTER_API_KEY = 'test-key'
    expect(resolveImageGenerationGate().allowed).toBe(true)
  })
})

describe('resolveImageGenerationGate', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    resetImageGenerationSpendForTests()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('allows when API key is present (always generate)', () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    delete process.env.AI_IMAGE_GENERATION_ENABLED
    delete process.env.AI_IMAGE_GENERATION_RIGHTS_ACKNOWLEDGED

    const gate = resolveImageGenerationGate()
    expect(gate.allowed).toBe(true)
  })

  test('blocks only when API key is missing', () => {
    delete process.env.OPENROUTER_API_KEY
    const gate = resolveImageGenerationGate()
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe('missing_api_key')
  })

  test('blocks when monthly spend ceiling exceeded', () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.AI_IMAGE_GENERATION_SPEND_CEILING_USD = '0.01'
    recordImageGenerationSpend(0.02)

    const gate = resolveImageGenerationGate()
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe('monthly_spend_ceiling')
  })
})

describe('parseOpenRouterImageResponse', () => {
  test('parses /images API b64_json payload', () => {
    const parsed = parseOpenRouterImageResponse({
      data: [{ b64_json: 'abc123' }],
    })
    expect(parsed).toEqual({
      dataUrl: 'data:image/png;base64,abc123',
      mimeType: 'image/png',
    })
  })

  test('parses chat completions images array', () => {
    const parsed = parseOpenRouterImageResponse({
      choices: [
        {
          message: {
            images: [{ image_url: { url: 'data:image/jpeg;base64,xyz' } }],
          },
        },
      ],
    })
    expect(parsed?.mimeType).toBe('image/jpeg')
    expect(parsed?.dataUrl).toContain('data:image/jpeg')
  })
})

describe('extractOpenRouterImageUsage', () => {
  test('maps cost from image generation usage', () => {
    const usage = extractOpenRouterImageUsage(
      {
        model: 'google/gemini-3.1-flash-lite-image',
        usage: { total_tokens: 100, cost: 0.02 },
      },
      'fallback'
    )
    expect(usage?.cost).toEqual({ amount: 0.02, currency: 'USD' })
    expect(usage?.totalTokens).toBe(100)
    expect(usage?.model).toBe('google/gemini-3.1-flash-lite-image')
  })
})

describe('buildGeneratedImageAsset and fallback', () => {
  test('buildGeneratedImageAsset produces downloadable draft metadata', () => {
    const asset = buildGeneratedImageAsset({
      platform: 'instagram',
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      rationale: 'Apoya el evento.',
    })

    expect(AiGeneratedImageSchema.safeParse(asset).success).toBe(true)
    expect(asset.status).toBe('draft')
    expect(asset.downloadFileName).toBe('sac-borrador-instagram.png')
  })

  test('applyImageAssetFallbackToDraft keeps imagePrompt and adds missingInformation', () => {
    const draft = applyImageAssetFallbackToDraft(
      {
        platform: 'instagram',
        contentType: 'image_post',
        draftText: 'Caption',
        imagePrompt: 'Cielo nocturno sobre el Caribe',
      },
      'timeout'
    )

    expect(draft.imagePrompt).toBe('Cielo nocturno sobre el Caribe')
    expect(draft.missingInformation.some((m) => m.includes('No se pudo generar imagen'))).toBe(
      true
    )
  })

  test('AiGenerationResultSchema accepts drafts with generatedImages', () => {
    const result = AiGenerationResultSchema.parse({
      drafts: [
        {
          platform: 'instagram',
          contentType: 'image_post',
          draftText: 'Texto',
          imagePrompt: 'Prompt',
          generatedImages: [
            {
              assetId: 'generated-instagram-0',
              status: 'draft',
              mimeType: 'image/png',
              dataUrl: 'data:image/png;base64,abc',
              downloadFileName: 'sac-borrador-instagram.png',
            },
          ],
        },
      ],
      recommendedNextStep: 'Validar',
      humanReviewRequired: true,
    })
    expect(result.drafts[0].generatedImages).toHaveLength(1)
  })
})

describe('checkImageGenerationSpendCeiling', () => {
  beforeEach(() => {
    resetImageGenerationSpendForTests()
  })

  test('allows spend when no ceiling configured', () => {
    delete process.env.AI_IMAGE_GENERATION_SPEND_CEILING_USD
    expect(checkImageGenerationSpendCeiling(1).allowed).toBe(true)
  })
})
