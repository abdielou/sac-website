/**
 * @jest-environment node
 */

jest.mock('workflow', () => ({ fetch: jest.fn() }))
jest.mock('../../lib/ai-openrouter-sdk', () => ({
  generateOpenRouterText: jest.fn(),
}))
jest.mock('../../lib/ai-generation-guardrails', () => {
  const actual = jest.requireActual('../../lib/ai-generation-guardrails')
  return {
    ...actual,
    applyGenerationGuardrails: jest.fn(actual.applyGenerationGuardrails),
  }
})

const { applyGenerationGuardrails } = require('../../lib/ai-generation-guardrails')
const { generateOpenRouterText } = require('../../lib/ai-openrouter-sdk')
const {
  generateTextStep,
} = require('../../workflows/ai-social-media-designer/generation/steps/text')

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
    id: 'generic_caption',
    label: 'Caption genérico',
    status: 'active',
    fields: [{ key: 'topic', label: 'Tema', required: true }],
    generation: { rules: 'Describe únicamente los datos provistos.' },
    validation: { rules: 'Comprueba claridad y exactitud.' },
    visual: {
      mode: 'none',
      template: null,
      imagePolicyByPlatform: { x: 'prohibited' },
    },
  }

  return {
    input: {
      platforms: ['x'],
      contentType: contentTypeDefinition.id,
      contentTypeDefinition,
      contentData: { topic: 'Saturno' },
      intent: 'Educar',
      topic: 'Saturno',
      knownFacts: [],
      hashtags: [],
      links: [],
    },
    guidelines: {
      version: 'guidelines-test',
      platforms: {
        x: {
          global: 'Mantén una voz educativa.',
          platform: 'Escribe con claridad.',
          captionMaxCharacters: null,
          contentType: 'Describe únicamente los datos provistos.',
          prohibited: 'No inventes hechos.',
        },
      },
    },
  }
}

function validCaption() {
  return JSON.stringify({
    caption: {
      contentType: 'generic_caption',
      draftText: 'Observa Saturno con curiosidad y paciencia.',
      assumptions: [],
      missingInformation: [],
    },
    recommendedNextStep: 'Validar antes de publicar.',
    humanReviewRequired: true,
  })
}

describe('generation text retry and usage semantics', () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    generateOpenRouterText.mockReset()
    applyGenerationGuardrails.mockImplementation(
      jest.requireActual('../../lib/ai-generation-guardrails').applyGenerationGuardrails
    )
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalApiKey
  })

  test('retains paid usage when a malformed schema response is repaired on retry', async () => {
    generateOpenRouterText
      .mockResolvedValueOnce({
        text: JSON.stringify({ caption: { contentType: 'generic_caption' } }),
        usage: usage('attempt-1', 3, 0.001),
      })
      .mockResolvedValueOnce({
        text: validCaption(),
        usage: usage('attempt-2', 5, 0.002),
      })
    const { input, guidelines } = fixture()

    const output = await generateTextStep(input, guidelines)

    expect(generateOpenRouterText).toHaveBeenCalledTimes(2)
    expect(output.ok).toBe(true)
    expect(output.usage).toMatchObject({
      openRouterGenerationId: 'attempt-2',
      promptTokens: 6,
      completionTokens: 2,
      totalTokens: 8,
      cost: { amount: 0.003, currency: 'USD' },
    })
  })

  test('retains usage but does not retry a deterministic local post-processing TypeError', async () => {
    generateOpenRouterText.mockResolvedValueOnce({
      text: validCaption(),
      usage: usage('attempt-1', 4, 0.001),
    })
    applyGenerationGuardrails.mockImplementationOnce(() => {
      throw new TypeError('bug local determinista')
    })
    const { input, guidelines } = fixture()

    const output = await generateTextStep(input, guidelines)

    expect(generateOpenRouterText).toHaveBeenCalledTimes(1)
    expect(output).toMatchObject({
      ok: false,
      retryable: false,
      usage: { openRouterGenerationId: 'attempt-1', totalTokens: 4 },
    })
  })

  test('propagates a deterministic provider/configuration rejection without retrying', async () => {
    generateOpenRouterText.mockRejectedValueOnce(
      Object.assign(new Error('Falta configuración'), {
        name: 'OpenRouterConfigurationError',
        retryable: false,
      })
    )
    const { input, guidelines } = fixture()

    const output = await generateTextStep(input, guidelines)

    expect(generateOpenRouterText).toHaveBeenCalledTimes(1)
    expect(output).toMatchObject({ ok: false, retryable: false, usage: null })
  })
})
