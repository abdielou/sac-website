/**
 * @jest-environment node
 */

jest.mock('workflow', () => ({ fetch: jest.fn() }))
jest.mock('../../lib/ai-openrouter-sdk', () => ({
  generateOpenRouterText: jest.fn(),
}))

const { generateOpenRouterText } = require('../../lib/ai-openrouter-sdk')
const {
  generateImagePromptsStep,
} = require('../../workflows/ai-social-media-designer/generation/steps/imagePrompts')

function makeVisualBrief(overrides = {}) {
  return {
    concept: 'A focused night of hands-on astronomical discovery',
    subject:
      'A complete amateur telescope on a sturdy tripod points skyward beside two anonymous observers seen from behind',
    environment:
      'A quiet open field beneath a clear Caribbean night sky with subtle tropical vegetation',
    composition:
      'The telescope anchors the left third, the observers remain secondary, and open sky creates strong hierarchy with safe margins',
    perspectiveAndDepth:
      'Eye-level wide view with foreground grass, a crisp midground subject, and a layered distant horizon',
    lighting: 'Low-key blue ambient light with a restrained warm rim light defining the equipment',
    colorPalette: 'Deep indigo and violet with muted teal shadows and a small warm amber accent',
    styleAndMedium:
      'Refined paper-cut editorial illustration with tactile layers and crisp dimensional edges',
    textTreatment: { mode: 'unspecified' },
    mustInclude: ['Subtle paper grain with no gradients', 'A physically complete telescope tripod'],
    mustAvoid: ['Identifiable faces', 'Split-screen product comparison'],
    ...overrides,
  }
}

function makeFixture() {
  const contentTypeDefinition = {
    id: 'education_post',
    label: 'Post educativo',
    status: 'active',
    fields: [{ key: 'topic', label: 'Tema', required: true }],
    generation: { rules: 'Representa visualmente el tema sin inventar hechos.' },
    visual: {
      mode: 'ai_image',
      template: null,
      imagePolicyByPlatform: { instagram: 'required', x: 'prohibited' },
    },
  }
  const contentTypeIdentity = {
    id: contentTypeDefinition.id,
    label: contentTypeDefinition.label,
    guidelineVersion: 'guidelines-v7',
  }
  const resolvedGuideline = {
    platform: 'Usa una composición legible para redes sociales.',
    captionMaxCharacters: null,
    global: 'Mantén una voz educativa y cercana.',
    prohibited: 'No inventes datos.',
    imagePrompt: 'La imagen debe representar el tema provisto.',
    contentTypeDefinition,
    contentTypeIdentity,
  }

  return {
    input: {
      platforms: ['instagram', 'x'],
      contentType: contentTypeDefinition.id,
      contentTypeDefinition,
      contentData: { topic: 'Cómo usar un telescopio' },
      intent: 'Educar',
      topic: 'Cómo usar un telescopio',
      tone: 'Didáctico',
      audience: 'Personas que comienzan en astronomía',
      imageStyle: 'Ilustración editorial de papel recortado',
      imageConstraints: 'Subtle paper grain with no gradients',
      knownFacts: ['El telescopio debe aparecer sobre un trípode completo'],
    },
    textResult: {
      drafts: [
        {
          platform: 'instagram',
          contentType: contentTypeDefinition.id,
          draftText: 'Aprende a preparar tu telescopio antes de observar.',
          assumptions: [],
          missingInformation: [],
        },
        {
          platform: 'x',
          contentType: contentTypeDefinition.id,
          draftText: 'Aprende a preparar tu telescopio antes de observar.',
          assumptions: [],
          missingInformation: [],
        },
      ],
      recommendedNextStep: 'Validar antes de publicar.',
      humanReviewRequired: true,
    },
    guidelines: {
      version: 'guidelines-v7',
      policyVersion: 'policy-v1',
      contentTypeDefinition,
      contentTypeIdentity,
      platforms: {
        instagram: resolvedGuideline,
        x: { ...resolvedGuideline, platform: 'Mantén el mensaje conciso.' },
      },
    },
  }
}

describe('generateImagePromptsStep structured quality contract', () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    generateOpenRouterText.mockReset()
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalApiKey
  })

  test('compiles a validated visual brief before merging it into eligible platforms', async () => {
    generateOpenRouterText.mockResolvedValueOnce({
      text: JSON.stringify({
        visualBrief: makeVisualBrief(),
        sharedImageRationale:
          'La escena convierte el tema educativo en una acción clara, específica y visualmente jerárquica.',
      }),
      usage: null,
    })
    const fixture = makeFixture()

    const output = await generateImagePromptsStep(
      fixture.input,
      fixture.textResult,
      fixture.guidelines
    )

    expect(output.ok).toBe(true)
    const instagram = output.result.drafts.find(({ platform }) => platform === 'instagram')
    const x = output.result.drafts.find(({ platform }) => platform === 'x')
    expect(instagram.imagePrompt).toContain('Core concept: A focused night')
    expect(instagram.imagePrompt).toContain('Composition and visual hierarchy:')
    expect(instagram.imagePrompt).toContain('Subtle paper grain with no gradients')
    expect(instagram.imagePrompt).toMatch(/vertical 3:4 canvas/i)
    expect(instagram.imagePrompt).toMatch(/No private information/i)
    expect(instagram.imageRationale).toMatch(/acción clara/)
    expect(x.imagePrompt).toBeUndefined()

    const request = generateOpenRouterText.mock.calls[0][0]
    expect(request.temperature).toBe(0.4)
    expect(request.messages[0].content).toMatch(/microhistoria visual/i)
    expect(request.messages[1].content).toContain('Ilustración editorial de papel recortado')
    expect(
      request.messages[1].content.match(/Representa visualmente el tema sin inventar hechos\./g)
    ).toHaveLength(1)
  })

  test('uses validation feedback to repair a malformed first response', async () => {
    generateOpenRouterText
      .mockResolvedValueOnce({
        text: JSON.stringify({
          visualBrief: { concept: 'Too short' },
          sharedImageRationale: 'Este primer intento no tiene todos los campos requeridos.',
        }),
        usage: null,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          visualBrief: makeVisualBrief(),
          sharedImageRationale:
            'El segundo intento satisface el contrato y conserva la intención editorial provista.',
        }),
        usage: null,
      })
    const fixture = makeFixture()

    const output = await generateImagePromptsStep(
      fixture.input,
      fixture.textResult,
      fixture.guidelines
    )

    expect(output.ok).toBe(true)
    expect(generateOpenRouterText).toHaveBeenCalledTimes(2)
    expect(generateOpenRouterText.mock.calls[1][0].messages.at(-1).content).toMatch(
      /Brief visual inválido/
    )
    expect(output.result.drafts[0].imagePrompt).toContain('Core concept:')
  })

  test('self-recovers with a Guidelines-grounded prompt when both structured responses are invalid', async () => {
    generateOpenRouterText
      .mockResolvedValueOnce({ text: '{"visualBrief":{"concept":"Too short"}}', usage: null })
      .mockResolvedValueOnce({ text: '{"visualBrief":{"concept":"Still short"}}', usage: null })
    const fixture = makeFixture()

    const output = await generateImagePromptsStep(
      fixture.input,
      fixture.textResult,
      fixture.guidelines
    )

    expect(generateOpenRouterText).toHaveBeenCalledTimes(2)
    expect(output).toMatchObject({
      ok: true,
      recovered: true,
      recoveryReason: 'structured_prompt_invalid',
    })
    expect(output.result.drafts[0].imagePrompt).toContain('Cómo usar un telescopio')
    expect(output.result.drafts[0].imagePrompt).toContain(
      'Representa visualmente el tema sin inventar hechos'
    )
    expect(output.result.drafts[1].imagePrompt).toBeUndefined()
  })
})
