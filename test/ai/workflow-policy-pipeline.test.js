/**
 * @jest-environment node
 */

jest.mock('workflow', () => ({
  fetch: jest.fn(),
  getWorkflowMetadata: jest.fn(() => null),
}))

jest.mock('../../lib/guidelines-store', () => ({
  getGuidelineVersion: jest.fn(),
}))

jest.mock('../../lib/ai-policy-review', () => ({
  classifyAiPolicyRequest: jest.fn(),
  reviewAiPolicyResult: jest.fn(),
}))

jest.mock('../../lib/run-history-store', () => ({
  persistRunHistory: jest.fn(),
}))

const sharp = require('sharp')
const { fetch: workflowFetch } = require('workflow')
const { getGuidelineVersion } = require('../../lib/guidelines-store')
const { classifyAiPolicyRequest, reviewAiPolicyResult } = require('../../lib/ai-policy-review')
const { AI_AGENT_IDENTITY_PROMPT, AI_BASE_POLICY_VERSION } = require('../../lib/ai-agent')
const { legacyInputToContentData } = require('../../lib/ai-content-data')
const { getDefaultGuidelines } = require('../../lib/ai-guidelines')
const { resolveContentTypeDefinition } = require('../../lib/ai-guidelines-schema')
const {
  GenerateInputSchema,
  generateAiWorkflow,
} = require('../../workflows/ai-social-media-designer/generation/generateAiWorkflow')
const {
  validateAiWorkflow,
} = require('../../workflows/ai-social-media-designer/validation/validateAiWorkflow')

function policyDecision(decision = 'allow', overrides = {}) {
  return {
    policyVersion: AI_BASE_POLICY_VERSION,
    stage: overrides.stage || 'request',
    decision,
    evaluatedDecision: decision,
    categories: decision === 'allow' ? [] : ['unrelated_image'],
    reason: decision === 'allow' ? 'Cumple.' : 'No cumple.',
    failClosed: false,
    errorCode: null,
    model: 'test/multimodal',
    usage: null,
    ...overrides,
  }
}

function openRouterResponse(content, images) {
  return {
    ok: true,
    json: async () => ({
      model: 'test/multimodal',
      choices: [{ message: { content, ...(images ? { images } : null) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  }
}

function runtimeFields(document, contentType, legacy) {
  const definition = resolveContentTypeDefinition(document, contentType)
  return {
    contentData: legacyInputToContentData(legacy, definition),
    contentTypeDefinition: definition,
    contentTypeIdentity: {
      id: definition.id,
      label: definition.label,
      guidelineVersion: document.version,
    },
    guidelineVersion: document.version,
    policyVersion: AI_BASE_POLICY_VERSION,
  }
}

describe('workflow policy pipeline', () => {
  const document = getDefaultGuidelines()
  let events
  const originalApiKey = process.env.OPENROUTER_API_KEY
  const originalModel = process.env.OPENROUTER_MODEL

  beforeEach(() => {
    jest.clearAllMocks()
    events = []
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_MODEL = 'test/multimodal'
    getGuidelineVersion.mockResolvedValue(document)
    classifyAiPolicyRequest.mockImplementation(async () => {
      events.push('pre-policy')
      return policyDecision('allow', { stage: 'request' })
    })
    reviewAiPolicyResult.mockImplementation(async () => {
      events.push('post-policy')
      return policyDecision('allow', { stage: 'result' })
    })
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalApiKey
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL
    else process.env.OPENROUTER_MODEL = originalModel
  })

  test('validation runs pre-policy, model, then post-policy before returning', async () => {
    let providerMessages
    workflowFetch.mockImplementation(async (_url, options) => {
      events.push('model')
      providerMessages = JSON.parse(options.body).messages
      return openRouterResponse(
        JSON.stringify({
          overallOutcome: 'pass',
          approvalRecommendation: 'ready_for_review',
          summary: 'Cumple las guías.',
          issues: [],
          humanReviewRequired: true,
        })
      )
    })
    const legacy = {
      intent: 'Validar claridad',
      topic: 'Saturno',
    }
    const result = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'caption',
      draftText: 'Acompáñanos a observar Saturno.',
      goal: legacy.intent,
      topic: legacy.topic,
      ...runtimeFields(document, 'caption', legacy),
    })

    expect(events).toEqual(['pre-policy', 'model', 'post-policy'])
    expect(providerMessages[0].content.startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    expect(providerMessages[0].content).not.toContain('<GUIDELINES_NO_CONFIABLES>')
    const providerUserText = providerMessages[1].content[0].text
    expect(providerUserText.indexOf('<GUIDELINES_NO_CONFIABLES>')).toBeLessThan(
      providerUserText.indexOf('<SOLICITUD_NO_CONFIABLE>')
    )
    expect(result.result).toMatchObject({
      overallOutcome: 'pass',
      humanReviewRequired: true,
    })
  })

  test('text-only platforms receive pinned Guidelines as untrusted user data', async () => {
    let providerMessages
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      providerMessages = body.messages
      events.push('model')
      return openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'reel_caption',
            draftText: 'Saturno será el tema de nuestra próxima conversación.',
            assumptions: [],
            missingInformation: [],
          },
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    })
    const legacy = { intent: 'Conversar con la comunidad', topic: 'Saturno' }

    const result = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x', 'facebook'],
      contentType: 'reel_caption',
      ...legacy,
      ...runtimeFields(document, 'reel_caption', legacy),
    })

    const systemPrompt = providerMessages[0].content
    const providerUserText = providerMessages[1].content
    expect(systemPrompt.startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    expect(systemPrompt).not.toContain('Voz de SAC: cercana, educativa')
    expect(systemPrompt).not.toContain('Caption de reel')
    expect(systemPrompt).toContain('Preserva los hechos provistos')
    expect(systemPrompt).toContain('Registra en "assumptions" cualquier supuesto')
    expect(providerUserText).toContain('<GUIDELINES_NO_CONFIABLES>')
    expect(providerUserText).toContain('Escribe en español claro')
    expect(providerUserText).toContain('No publicidad comercial no autorizada')
    expect(providerUserText).not.toContain('Usa los datos provistos tal como fueron escritos')
    expect(providerUserText).toContain('Caption de reel')
    expect(providerUserText.indexOf('<GUIDELINES_NO_CONFIABLES>')).toBeLessThan(
      providerUserText.indexOf('<SOLICITUD_NO_CONFIABLE>')
    )
    expect(result.result.generatedImage).toBeUndefined()
    expect(events).toEqual(['pre-policy', 'model', 'post-policy'])
  })

  test('treats observation-night poster copy as creative text while preserving logistics', async () => {
    workflowFetch.mockImplementation(async () => {
      events.push('model')
      return openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'observation_night',
            draftText:
              'Acompáñanos a nuestra Noche de Observación el 15 de agosto a las 7:30 p. m. en Cabo Rojo.',
            assumptions: [],
            missingInformation: [],
          },
          posterSubtitle: 'Ven a mirar el cielo con nosotros',
          posterBody: 'Una noche para compartir la curiosidad bajo las estrellas.',
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    })
    reviewAiPolicyResult.mockImplementation(async ({ result, images }) => {
      events.push('post-policy')
      if (!images.length) {
        expect(result.posterCreativeText).toEqual({
          subtitle: 'Ven a mirar el cielo con nosotros',
          body: 'Una noche para compartir la curiosidad bajo las estrellas.',
        })
        expect(result.policyContext.posterCreativeText).toContain('no datos logísticos')
      }
      return policyDecision('allow', { stage: 'result' })
    })
    const legacy = {
      intent: 'Invitar a la comunidad',
      topic: 'Noche de Observación',
      eventDetails: {
        name: 'Noche de Observación',
        date: '2026-08-15',
        time: '19:30',
        location: 'Cabo Rojo',
      },
      cta: 'Acompáñanos',
    }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x', 'instagram', 'facebook'],
      contentType: 'observation_night',
      backgroundMode: 'stock',
      backgroundId: 'telescope-nebula',
      ...legacy,
      ...runtimeFields(document, 'observation_night', legacy),
    })

    expect(output.result.policyReview).toBeUndefined()
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.result.templateRequest.textFields).toMatchObject({
      subtitle: 'Ven a mirar el cielo con nosotros',
      body: 'Una noche para compartir la curiosidad bajo las estrellas.',
      dateLabel: 'SÁB 15 AGO',
      timeLabel: '7:30 PM',
      locationLabel: 'Cabo Rojo',
    })
  })

  test('keeps a reviewed observation-night image when the final reviewer only has a factual doubt', async () => {
    workflowFetch.mockImplementation(async () =>
      openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'observation_night',
            draftText: 'Noche de Observación el 15 de agosto a las 7:30 p. m. en Cabo Rojo.',
            assumptions: [],
            missingInformation: [],
          },
          posterSubtitle: 'Acompáñanos bajo las estrellas',
          posterBody: 'Una noche para mirar el cielo en comunidad.',
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    )
    reviewAiPolicyResult
      .mockImplementationOnce(async () => policyDecision('allow', { stage: 'result' }))
      .mockImplementationOnce(async () =>
        policyDecision('block', {
          stage: 'result',
          categories: ['fabricated_facts'],
          reason: 'No pude confirmar si omitir el año cambia la fecha.',
        })
      )
    const legacy = {
      intent: 'Invitar a la comunidad',
      topic: 'Noche de Observación',
      eventDetails: {
        name: 'Noche de Observación',
        date: '2026-08-15',
        time: '19:30',
        location: 'Cabo Rojo',
      },
      cta: 'Acompáñanos',
    }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x', 'instagram', 'facebook'],
      contentType: 'observation_night',
      backgroundMode: 'stock',
      backgroundId: 'telescope-nebula',
      ...legacy,
      ...runtimeFields(document, 'observation_night', legacy),
    })

    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.result.policyReview).toMatchObject({
      stage: 'result',
      disposition: 'review',
      categories: ['fabricated_facts'],
      reason: 'No pude confirmar si omitir el año cambia la fecha.',
    })
  })

  test('a post-policy block prevents a prepared visual result from being returned', async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 10, g: 20, b: 50 },
      },
    })
      .png()
      .toBuffer()
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`

    workflowFetch.mockImplementation(async (_url, options) => {
      events.push('model')
      const body = JSON.parse(options.body)
      const system = body.messages?.[0]?.content || ''
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'Un telescopio bajo un cielo familiar y seguro.',
            sharedImageRationale: 'Apoya el tema.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      return openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'caption',
            draftText: 'Observa Saturno con SAC.',
            assumptions: [],
            missingInformation: [],
          },
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    })
    reviewAiPolicyResult.mockImplementation(async ({ result, images }) => {
      events.push('post-policy')
      if (!result.generatedImage) return policyDecision('allow', { stage: 'result' })
      expect(result.generatedImage.preparedForDisplay).toBe(true)
      expect(images).toEqual([result.generatedImage.dataUrl])
      return policyDecision('block', {
        stage: 'result',
        categories: ['unrelated_image'],
        reason: 'La imagen no corresponde al caption.',
      })
    })
    const legacy = {
      intent: 'Invitar a observar',
      topic: 'Saturno',
    }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'caption',
      ...legacy,
      ...runtimeFields(document, 'caption', legacy),
    })

    expect(output.result.generatedImage).toBeUndefined()
    expect(output.result.policyReview).toMatchObject({
      stage: 'result',
      disposition: 'block',
      categories: ['unrelated_image'],
      reason: 'La imagen no corresponde al caption.',
    })
    expect(events[0]).toBe('pre-policy')
    expect(events.at(-1)).toBe('post-policy')
  })

  test('generates required holiday typography and preserves a guideline mismatch for review', async () => {
    const greetingDocument = JSON.parse(JSON.stringify(document))
    const regularPost = greetingDocument.contentTypeCatalog.find(({ id }) => id === 'regular_post')
    regularPost.generation.rules =
      'Debe generar una felicitación de acuerdo al día festivo. La imagen generada debe incluir la felicitación. Para este ejemplo, la escena debe incluir un cielo estrellado y un telescopio.'
    regularPost.visual = {
      mode: 'ai_image',
      template: null,
      backgroundSources: [],
      sponsorAllowed: false,
      imagePolicyByPlatform: { x: 'prohibited', instagram: 'required', facebook: 'optional' },
    }
    getGuidelineVersion.mockResolvedValueOnce(greetingDocument)

    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 9, g: 20, b: 55 },
      },
    })
      .png()
      .toBuffer()
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    let imagePromptSystem = ''
    let imagePromptRequest = ''
    let imageAssetRequest = ''

    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = body.messages?.[0]?.content || ''
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        imagePromptSystem = system
        imagePromptRequest = body.messages?.[1]?.content || ''
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt:
              'Father and child seen from behind observing the stars; no identifiable faces; no text overlay.',
            sharedImageRationale: 'Celebra el Día del Padre con astronomía.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageAssetRequest = body.messages?.[1]?.content || ''
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      return openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'regular_post',
            draftText: 'Feliz Día del Padre a quienes nos enseñan a mirar más allá.',
            assumptions: [],
            missingInformation: [],
          },
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    })
    reviewAiPolicyResult
      .mockImplementationOnce(async () => policyDecision('allow', { stage: 'result' }))
      .mockImplementationOnce(async ({ result }) => {
        expect(result.policyContext.imageTextRequirement).toMatchObject({
          required: true,
          suggestedText: 'Feliz Día del Padre',
        })
        return policyDecision('block', {
          stage: 'result',
          categories: ['guideline_noncompliance'],
          reason: 'La escena corresponde al tema, pero el texto requerido necesita corrección.',
        })
      })
    const legacy = {
      intent: 'Felicitar a los padres de la comunidad del SAC',
      topic: 'Día del Padre',
    }

    const request = {
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'regular_post',
      ...legacy,
      ...runtimeFields(greetingDocument, 'regular_post', legacy),
    }
    GenerateInputSchema.parse(request)
    const output = await generateAiWorkflow(request)

    expect(imagePromptSystem).toContain('TEXTO EN IMAGEN: REQUERIDO')
    expect(imagePromptSystem).toContain('Feliz Día del Padre')
    expect(imagePromptSystem).toContain('motivos culturales, estacionales')
    expect(imagePromptSystem).toContain('limitación visual adicional definida en Guidelines')
    expect(imagePromptSystem).not.toContain('elemento astronómico protagonista')
    expect(imagePromptRequest).toContain(
      'Para este ejemplo, la escena debe incluir un cielo estrellado y un telescopio.'
    )
    expect(imageAssetRequest).toContain('Required on-image text: "Feliz Día del Padre"')
    expect(imageAssetRequest).toContain('aligned with the publication topic, occasion, and caption')
    expect(imageAssetRequest).not.toContain('at least one prominent astronomy anchor')
    expect(imageAssetRequest).not.toContain('flowers alone is not acceptable')
    expect(imageAssetRequest).not.toMatch(/no text overlay/i)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.result.policyReview).toMatchObject({
      stage: 'result',
      disposition: 'review',
      categories: ['guideline_noncompliance'],
    })
  })

  test('blocks a caption with fabricated facts before spending on image generation', async () => {
    workflowFetch.mockImplementation(async (_url, options) => {
      events.push('model')
      const body = JSON.parse(options.body)
      expect(body.modalities || []).not.toContain('image')
      expect(body.messages?.[0]?.content || '').not.toContain('INSTRUCCIONES OPERATIVAS DE IMAGEN')
      return openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'caption',
            draftText: 'Observa Saturno mañana a las 8:00 p. m. en Cabo Rojo.',
            assumptions: [],
            missingInformation: [],
          },
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    })
    reviewAiPolicyResult.mockImplementationOnce(async () => {
      events.push('post-policy')
      return policyDecision('block', {
        stage: 'result',
        categories: ['fabricated_facts'],
        reason: 'El caption añadió una fecha, hora y lugar no provistos.',
      })
    })
    const legacy = { intent: 'Invitar a observar', topic: 'Saturno' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'caption',
      ...legacy,
      ...runtimeFields(document, 'caption', legacy),
    })

    expect(workflowFetch).toHaveBeenCalledTimes(1)
    expect(output.result.generatedImage).toBeUndefined()
    expect(output.result.policyReview).toMatchObject({
      stage: 'caption',
      disposition: 'review',
      categories: ['fabricated_facts'],
      reason: 'El caption añadió una fecha, hora y lugar no provistos.',
    })
  })

  test('required visual generation fails closed when no final image can be prepared', async () => {
    const requiredImageDocument = JSON.parse(JSON.stringify(document))
    const caption = requiredImageDocument.contentTypeCatalog.find(({ id }) => id === 'caption')
    caption.visual.imagePolicyByPlatform.instagram = 'required'
    getGuidelineVersion.mockResolvedValueOnce(requiredImageDocument)

    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = body.messages?.[0]?.content || ''
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'Un telescopio bajo un cielo nocturno seguro.',
            sharedImageRationale: 'Apoya el tema.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        return openRouterResponse('')
      }
      return openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'caption',
            draftText: 'Observa Saturno con SAC.',
            assumptions: [],
            missingInformation: [],
          },
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    })
    const legacy = { intent: 'Invitar a observar', topic: 'Saturno' }

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['instagram'],
        contentType: 'caption',
        ...legacy,
        ...runtimeFields(requiredImageDocument, 'caption', legacy),
      })
    ).rejects.toThrow(/imagen requerida/i)

    expect(events).toEqual(['pre-policy', 'post-policy'])
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
  })

  test('a pre-policy block prevents provider generation and post-review', async () => {
    classifyAiPolicyRequest.mockImplementationOnce(async () => {
      events.push('pre-policy')
      return policyDecision('block', { stage: 'request' })
    })
    const legacy = { intent: 'Texto fuera de alcance', topic: 'Solicitud' }

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['x'],
        contentType: 'reel_caption',
        ...legacy,
        ...runtimeFields(document, 'reel_caption', legacy),
      })
    ).rejects.toThrow(/bloqueada por política.*unrelated_image.*No cumple/i)

    expect(events).toEqual(['pre-policy'])
    expect(workflowFetch).not.toHaveBeenCalled()
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
  })

  test('a pinned version missing the requested platform fails before policy or provider calls', async () => {
    const documentWithoutX = JSON.parse(JSON.stringify(document))
    delete documentWithoutX.platforms.x
    delete documentWithoutX.platformLabels.x
    getGuidelineVersion.mockResolvedValueOnce(documentWithoutX)
    const legacy = { intent: 'Conversar con la comunidad', topic: 'Saturno' }

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['x', 'instagram', 'facebook'],
        contentType: 'regular_post',
        backgroundMode: 'stock',
        backgroundId: 'telescope-nebula',
        ...legacy,
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow(/Guidelines fijada/i)

    expect(events).toEqual([])
    expect(workflowFetch).not.toHaveBeenCalled()
    expect(classifyAiPolicyRequest).not.toHaveBeenCalled()
  })
})
