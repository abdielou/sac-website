/**
 * @jest-environment node
 */

jest.mock('workflow', () => ({ fetch: jest.fn() }))
jest.mock('../../lib/ai-openrouter-sdk', () => ({
  generateOpenRouterImage: jest.fn(),
}))
jest.mock('../../lib/ai-image-generation', () => {
  const actual = jest.requireActual('../../lib/ai-image-generation')
  return {
    ...actual,
    buildGeneratedImageAsset: jest.fn(actual.buildGeneratedImageAsset),
  }
})

const { buildGeneratedImageAsset } = require('../../lib/ai-image-generation')
const { generateOpenRouterImage } = require('../../lib/ai-openrouter-sdk')
const {
  classifyImageProviderFailure,
  generateImageAssetsStep,
} = require('../../workflows/ai-social-media-designer/generation/steps/imageAssets')

const usage = (id, totalTokens, amount) => ({
  openRouterGenerationId: id,
  model: 'test/multimodal',
  promptTokens: totalTokens - 1,
  completionTokens: 1,
  totalTokens,
  cost: { amount, currency: 'USD' },
})

function fixture() {
  const contentTypeDefinition = {
    id: 'generic_visual',
    label: 'Visual genérico',
    status: 'active',
    fields: [{ key: 'topic', label: 'Tema', required: true }],
    generation: { rules: 'Representa únicamente los datos provistos.' },
    validation: { rules: 'Comprueba claridad y exactitud.' },
    visual: {
      mode: 'ai_image',
      template: null,
      imagePolicyByPlatform: { instagram: 'required' },
    },
  }
  const promptResult = {
    drafts: [
      {
        platform: 'instagram',
        contentType: contentTypeDefinition.id,
        draftText: 'Observa Saturno esta noche.',
        assumptions: [],
        missingInformation: [],
        imagePrompt: 'A physically plausible telescope beneath a clear night sky.',
        imageRationale: 'Representa el tema sin añadir hechos.',
      },
    ],
    recommendedNextStep: 'Validar antes de publicar.',
    humanReviewRequired: true,
  }

  return {
    input: {
      platforms: ['instagram'],
      contentType: contentTypeDefinition.id,
      contentTypeDefinition,
      contentData: { topic: 'Saturno' },
      topic: 'Saturno',
      knownFacts: [],
    },
    promptResult,
    guidelines: {
      version: 'guidelines-test',
      contentTypeDefinition,
      platforms: {
        instagram: {
          global: 'Mantén una voz educativa.',
          platform: 'Usa composición legible.',
          contentType: 'Representa únicamente los datos provistos.',
          prohibited: 'No inventes hechos.',
          imagePrompt: 'La imagen debe corresponder al tema.',
        },
      },
    },
  }
}

describe('image asset retry and usage semantics', () => {
  beforeEach(() => {
    generateOpenRouterImage.mockReset()
    buildGeneratedImageAsset.mockImplementation(
      jest.requireActual('../../lib/ai-image-generation').buildGeneratedImageAsset
    )
  })

  test('retries a paid response without an image and retains usage from both attempts', async () => {
    generateOpenRouterImage
      .mockResolvedValueOnce({ image: null, usage: usage('attempt-1', 4, 0.002) })
      .mockResolvedValueOnce({
        image: { dataUrl: 'data:image/png;base64,QUFBQQ==', mimeType: 'image/png' },
        usage: usage('attempt-2', 6, 0.003),
      })
    const { input, promptResult, guidelines } = fixture()

    const output = await generateImageAssetsStep(input, promptResult, guidelines)

    expect(generateOpenRouterImage).toHaveBeenCalledTimes(2)
    expect(output.result.generatedImage?.dataUrl).toBe('data:image/png;base64,QUFBQQ==')
    expect(output.usage).toMatchObject({
      openRouterGenerationId: 'attempt-2',
      totalTokens: 10,
      cost: { amount: 0.005, currency: 'USD' },
    })
  })

  test('retains paid usage without retrying a deterministic local post-processing TypeError', async () => {
    generateOpenRouterImage.mockResolvedValueOnce({
      image: { dataUrl: 'data:image/png;base64,QUFBQQ==', mimeType: 'image/png' },
      usage: usage('attempt-1', 7, 0.003),
    })
    buildGeneratedImageAsset.mockImplementationOnce(() => {
      throw new TypeError('bug local determinista')
    })
    const { input, promptResult, guidelines } = fixture()

    const output = await generateImageAssetsStep(input, promptResult, guidelines)

    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1)
    expect(output.result.generatedImage).toBeUndefined()
    expect(output).toMatchObject({
      retryable: false,
      failure: {
        code: 'image_asset_processing_failed',
        stage: 'image_generation',
        retryable: false,
      },
      usage: { openRouterGenerationId: 'attempt-1', totalTokens: 7 },
    })
  })

  test('does not retry an image-provider configuration error', async () => {
    const error = new Error('Falta OPENROUTER_API_KEY')
    error.name = 'OpenRouterConfigurationError'
    error.retryable = false
    generateOpenRouterImage.mockRejectedValueOnce(error)
    const { input, promptResult, guidelines } = fixture()

    const output = await generateImageAssetsStep(input, promptResult, guidelines)

    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1)
    expect(output).toMatchObject({
      retryable: false,
      providerAttempts: 1,
      failure: {
        code: 'image_provider_configuration_error',
        stage: 'image_provider',
        retryable: false,
      },
    })
  })

  test('reports exhausted transient retries and retains usage from every attempt', async () => {
    const first = new Error('OpenRouter HTTP 503')
    first.retryable = true
    first.usage = usage('attempt-1', 4, 0.002)
    const second = new Error('OpenRouter HTTP 503')
    second.retryable = true
    second.usage = usage('attempt-2', 6, 0.003)
    generateOpenRouterImage.mockRejectedValueOnce(first).mockRejectedValueOnce(second)
    const { input, promptResult, guidelines } = fixture()

    const output = await generateImageAssetsStep(input, promptResult, guidelines)

    expect(generateOpenRouterImage).toHaveBeenCalledTimes(2)
    expect(output).toMatchObject({
      retryable: true,
      providerAttempts: 2,
      failure: {
        code: 'image_provider_retry_exhausted',
        stage: 'image_provider',
        retryable: true,
      },
      usage: {
        openRouterGenerationId: 'attempt-2',
        totalTokens: 10,
        cost: { amount: 0.005, currency: 'USD' },
      },
    })
  })

  test('distinguishes a rejected request from account or model configuration', () => {
    const rejected = new Error('OpenRouter HTTP 400')
    rejected.statusCode = 400
    rejected.openRouterErrorCode = 'provider_rejection'
    rejected.retryable = false
    const forbidden = new Error('OpenRouter HTTP 403')
    forbidden.statusCode = 403
    forbidden.openRouterErrorCode = 'provider_rejection'
    forbidden.retryable = false

    expect(classifyImageProviderFailure(rejected)).toMatchObject({
      code: 'image_provider_rejected',
      retryable: false,
    })
    expect(classifyImageProviderFailure(forbidden)).toMatchObject({
      code: 'image_provider_configuration_error',
      retryable: false,
    })
  })
})
