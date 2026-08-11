import {
  applyImageAssetFallbackToDraft,
  buildGeneratedImageAsset,
  extractOpenRouterImageUsage,
  getImageGenerationConfig,
  parseOpenRouterImageResponse,
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

  test('uses OPENROUTER_MODEL (no separate image model)', () => {
    process.env.OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-image'
    expect(getImageGenerationConfig().model).toBe('google/gemini-3.1-flash-lite-image')
  })

  test('uses the multimodal default when OPENROUTER_MODEL is absent', () => {
    delete process.env.OPENROUTER_MODEL
    expect(getImageGenerationConfig()).toEqual({
      model: 'google/gemini-3.1-flash-lite-image',
      aspectRatio: '3:4',
    })
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
  test('buildGeneratedImageAsset produces downloadable draft metadata (platform-specific)', () => {
    const asset = buildGeneratedImageAsset({
      platform: 'instagram',
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      rationale: 'Apoya el evento.',
      contentType: 'regular_post',
      topic: 'Eclipse lunar',
      generatedAt: '2026-08-01T18:30:00Z',
    })

    expect(AiGeneratedImageSchema.safeParse(asset).success).toBe(true)
    expect(asset.status).toBe('draft')
    expect(asset.downloadFileName).toBe('SAC-publicacion-eclipse-lunar-2026-08-01.png')
  })

  test('buildGeneratedImageAsset uses neutral naming when platform omitted', () => {
    const asset = buildGeneratedImageAsset({
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      rationale: 'Shared visual.',
      generatedAt: '2026-08-01T18:30:00Z',
    })

    expect(asset.assetId).toBe('generated-social-0')
    expect(asset.downloadFileName).toBe('SAC-publicacion-2026-08-01.png')
    expect(AiGeneratedImageSchema.safeParse(asset).success).toBe(true)
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
    expect(draft.missingInformation.some((m) => m.includes('No se pudo generar imagen'))).toBe(true)
  })

  test('AiGenerationResultSchema keeps one shared generated image at result level', () => {
    const sharedAsset = {
      assetId: 'generated-social-0',
      status: 'draft',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,abc',
      downloadFileName: 'sac-borrador-social.png',
    }
    const result = AiGenerationResultSchema.parse({
      drafts: [
        {
          platform: 'instagram',
          contentType: 'image_post',
          draftText: 'Texto IG',
          imagePrompt: 'Prompt',
        },
        {
          platform: 'x',
          contentType: 'image_post',
          draftText: 'Texto X',
          imagePrompt: 'Prompt',
        },
      ],
      generatedImage: sharedAsset,
      recommendedNextStep: 'Validar',
      humanReviewRequired: true,
    })
    expect(result.generatedImage.assetId).toBe('generated-social-0')
    expect(result.drafts[0].generatedImages).toBeUndefined()
  })
})
