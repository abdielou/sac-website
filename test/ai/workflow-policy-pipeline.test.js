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
  buildUserKey: jest.fn(() => 'test-user-key'),
  persistAiRunFailure: jest.fn(),
  persistRunHistory: jest.fn(),
}))

jest.mock('../../lib/ai-run-lease-store', () => ({
  confirmAiRunClaim: jest.fn(),
}))

const sharp = require('sharp')
const { fetch: workflowFetch, getWorkflowMetadata } = require('workflow')
const { getGuidelineVersion } = require('../../lib/guidelines-store')
const { confirmAiRunClaim } = require('../../lib/ai-run-lease-store')
const { persistAiRunFailure, persistRunHistory } = require('../../lib/run-history-store')
const { classifyAiPolicyRequest, reviewAiPolicyResult } = require('../../lib/ai-policy-review')
const { AI_AGENT_IDENTITY_PROMPT, AI_BASE_POLICY_VERSION } = require('../../lib/ai-agent')
const { legacyInputToContentData } = require('../../lib/ai-content-data')
const { getDefaultGuidelines } = require('../../lib/ai-guidelines')
const {
  createContentType,
  resolveContentTypeDefinition,
} = require('../../lib/ai-guidelines-schema')
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

function withLegacyCaptionTypes(document) {
  let fixture = createContentType(document, { id: 'caption', label: 'Caption' })
  fixture = createContentType(fixture, {
    id: 'reel_caption',
    label: 'Caption de reel',
  })

  fixture.contentTypeCatalog = fixture.contentTypeCatalog.map((entry) => {
    if (entry.id === 'caption') {
      return {
        ...entry,
        validation: { rules: 'Validar el caption contra la información provista.' },
        generation: { rules: 'Generar un caption fiel a la información provista.' },
      }
    }
    if (entry.id === 'reel_caption') {
      return {
        ...entry,
        validation: { rules: 'Validar el caption del reel contra la información provista.' },
        generation: { rules: 'Caption de reel: generar texto breve para un reel existente.' },
      }
    }
    return entry
  })
  return fixture
}

describe('workflow policy pipeline', () => {
  const document = getDefaultGuidelines()
  const legacyCaptionDocument = withLegacyCaptionTypes(document)
  let events
  const originalApiKey = process.env.OPENROUTER_API_KEY
  const originalModel = process.env.OPENROUTER_MODEL

  beforeEach(() => {
    jest.clearAllMocks()
    events = []
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_MODEL = 'test/multimodal'
    getWorkflowMetadata.mockReturnValue(null)
    confirmAiRunClaim.mockResolvedValue({ ok: true, coordination: 's3' })
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
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-validation-1' })
    confirmAiRunClaim.mockImplementationOnce(async () => {
      events.push('claim')
      return { ok: true, coordination: 's3' }
    })
    let providerBody
    workflowFetch.mockImplementation(async (_url, options) => {
      events.push('model')
      providerBody = JSON.parse(options.body)
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
      contentType: 'regular_post',
      draftText: 'Acompáñanos a observar Saturno.',
      goal: legacy.intent,
      topic: legacy.topic,
      runCoordination: { claimId: 'claim-validation-1', coordination: 's3' },
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(events).toEqual(['claim', 'pre-policy', 'model', 'post-policy'])
    expect(confirmAiRunClaim).toHaveBeenCalledWith({
      userId: 'user-1',
      mode: 'validate',
      claimId: 'claim-validation-1',
      runId: 'wrun-validation-1',
      coordination: 's3',
    })
    expect(providerBody.modalities).toEqual(['text'])
    expect(providerBody.image_config).toBeUndefined()
    const providerMessages = providerBody.messages
    expect(providerMessages[0].content.startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    expect(providerMessages[0].content).not.toContain('<GUIDELINES_NO_CONFIABLES>')
    expect(providerMessages[0].content).toContain('Si "issues" está vacío')
    expect(providerMessages[0].content).toContain('No repitas el borrador original')
    const providerUserText = providerMessages[1].content[0].text
    expect(providerUserText.indexOf('<GUIDELINES_NO_CONFIABLES>')).toBeLessThan(
      providerUserText.indexOf('<SOLICITUD_NO_CONFIABLE>')
    )
    expect(result.result).toMatchObject({
      overallOutcome: 'pass',
      humanReviewRequired: true,
    })
    expect(classifyAiPolicyRequest).toHaveBeenCalledWith(
      expect.objectContaining({ reviewMode: 'validation' }),
      expect.any(Object)
    )
    expect(reviewAiPolicyResult).toHaveBeenCalledWith(
      expect.objectContaining({ reviewMode: 'validation' }),
      expect.any(Object)
    )
  })

  test('a corrected draft cannot pass when proofreading is required by Guidelines', async () => {
    const proofreadingDocument = JSON.parse(JSON.stringify(document))
    proofreadingDocument.version = 'proofreading-v1'
    proofreadingDocument.contentTypeCatalog = proofreadingDocument.contentTypeCatalog.map(
      (entry) =>
        entry.id === 'regular_post'
          ? {
              ...entry,
              validation: {
                ...entry.validation,
                rules: `${entry.validation.rules}\nRevisar ortografía, gramática y puntuación.`,
              },
            }
          : entry
    )
    getGuidelineVersion.mockResolvedValueOnce(proofreadingDocument)
    workflowFetch.mockResolvedValueOnce(
      openRouterResponse(
        JSON.stringify({
          overallOutcome: 'pass',
          approvalRecommendation: 'ready_for_review',
          summary: 'El borrador necesita una corrección ortográfica.',
          issues: [
            {
              severity: 'minor',
              category: 'guideline_compliance',
              message: 'Falta la tilde en “Acompáñanos”.',
            },
          ],
          suggestedRevision: 'Acompáñanos a observar Saturno.',
          humanReviewRequired: true,
        })
      )
    )
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    const result = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'regular_post',
      draftText: 'Acompananos a observar Saturno.',
      ...runtimeFields(proofreadingDocument, 'regular_post', legacy),
    })

    expect(result.result).toMatchObject({
      overallOutcome: 'warning',
      approvalRecommendation: 'needs_edits',
    })
    expect(result.result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'minor',
          category: 'guideline_compliance',
        }),
      ])
    )
  })

  test('drops a suggested revision that differs only by line endings', async () => {
    workflowFetch.mockResolvedValueOnce(
      openRouterResponse(
        JSON.stringify({
          summary: 'No se detectaron problemas.',
          issues: [],
          suggestedRevision: 'Primera línea.\n\nSegunda línea.',
        })
      )
    )
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    const output = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'regular_post',
      draftText: 'Primera línea.\r\n\r\nSegunda línea.',
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(output.result).toMatchObject({
      overallOutcome: 'pass',
      approvalRecommendation: 'ready_for_review',
      issues: [],
    })
    expect(output.result.suggestedRevision).toBeUndefined()
    expect(reviewAiPolicyResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.not.objectContaining({ suggestedRevision: expect.anything() }),
      }),
      expect.any(Object)
    )
  })

  test('retries an unexplained material revision and reports an inconclusive validation', async () => {
    const inconsistentResponse = openRouterResponse(
      JSON.stringify({
        summary: 'No se detectaron problemas.',
        issues: [],
        suggestedRevision: 'Un texto materialmente diferente.',
      })
    )
    workflowFetch
      .mockResolvedValueOnce(inconsistentResponse)
      .mockResolvedValueOnce(inconsistentResponse)
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    const output = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'regular_post',
      draftText: 'Texto original.',
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(workflowFetch).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(workflowFetch.mock.calls[1][1].body)
    expect(retryBody.messages[0].content).toContain('CORRECCIÓN DE CONTRATO')
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(output.result).toMatchObject({
      resultSource: 'system',
      overallOutcome: 'fail',
      approvalRecommendation: 'do_not_publish',
    })
    expect(output.result.summary).toMatch(/no fue posible validar/i)
    expect(output.result.suggestedRevision).toBeUndefined()
  })

  test('a guideline-only post-review block does not replace the validation diagnosis', async () => {
    workflowFetch.mockResolvedValueOnce(
      openRouterResponse(
        JSON.stringify({
          overallOutcome: 'warning',
          approvalRecommendation: 'needs_edits',
          summary: 'Se encontraron errores en el borrador.',
          issues: [
            {
              severity: 'minor',
              category: 'guideline_compliance',
              message: 'Corrige la ortografía y el nombre oficial de SAC.',
            },
          ],
          suggestedRevision: 'Sociedad de Astronomía del Caribe.',
          humanReviewRequired: true,
        })
      )
    )
    reviewAiPolicyResult.mockResolvedValueOnce(
      policyDecision('block', {
        stage: 'result',
        categories: ['guideline_noncompliance'],
        reason: 'El borrador original contiene errores que violan las Guidelines.',
      })
    )
    const legacy = { intent: 'Validar claridad', topic: 'SAC' }

    const output = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'regular_post',
      draftText: 'Sociedad Astronomica del Caribe.',
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(output.result).toMatchObject({
      overallOutcome: 'warning',
      approvalRecommendation: 'needs_edits',
      summary: 'Se encontraron errores en el borrador.',
    })
    expect(output.result.issues[0].message).toMatch(/nombre oficial/i)
    expect(output.result.platformNotes).toBeUndefined()
  })

  test('a guideline-only pre-review block does not bypass the validator', async () => {
    classifyAiPolicyRequest.mockResolvedValueOnce(
      policyDecision('block', {
        stage: 'request',
        categories: ['guideline_noncompliance'],
        reason: 'El borrador contiene una falta ortográfica.',
      })
    )
    workflowFetch.mockResolvedValueOnce(
      openRouterResponse(
        JSON.stringify({
          overallOutcome: 'warning',
          approvalRecommendation: 'needs_edits',
          summary: 'El borrador requiere una corrección.',
          issues: [
            {
              severity: 'minor',
              category: 'guideline_compliance',
              message: 'Corrige la falta ortográfica.',
            },
          ],
          suggestedRevision: 'Texto corregido.',
          humanReviewRequired: true,
        })
      )
    )
    const legacy = { intent: 'Validar claridad', topic: 'SAC' }

    const output = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'regular_post',
      draftText: 'Texto con error.',
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(workflowFetch).toHaveBeenCalledTimes(1)
    expect(output.result).toMatchObject({
      overallOutcome: 'warning',
      approvalRecommendation: 'needs_edits',
    })
    expect(output.result.issues[0].message).toMatch(/falta ortográfica/i)
  })

  test('a lost validation claim terminates before schema, Guidelines, policy, or provider work', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-validation-lost' })
    confirmAiRunClaim.mockRejectedValueOnce(
      Object.assign(new Error('AI_RUN_CLAIM_LOST'), { code: 'AI_RUN_CLAIM_LOST' })
    )
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    await expect(
      validateAiWorkflow({
        userId: 'user-1',
        userEmail: 'invalid-email',
        platform: 'facebook',
        contentType: 'regular_post',
        draftText: 'Acompáñanos a observar Saturno.',
        runCoordination: { claimId: 'claim-validation-lost', coordination: 's3' },
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow('AI_RUN_CLAIM_LOST')

    expect(getGuidelineVersion).not.toHaveBeenCalled()
    expect(classifyAiPolicyRequest).not.toHaveBeenCalled()
    expect(workflowFetch).not.toHaveBeenCalled()
  })

  test('an unconfirmed generation claim terminates before schema, Guidelines, policy, or provider work', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-generation-lost' })
    confirmAiRunClaim.mockResolvedValueOnce({ ok: false, coordination: 's3' })
    const legacy = { intent: 'Conversar con la comunidad', topic: 'Saturno' }

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'invalid-email',
        platforms: ['x'],
        contentType: 'regular_post',
        runCoordination: { claimId: 'claim-generation-lost', coordination: 's3' },
        ...legacy,
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow('AI_RUN_CLAIM_LOST')

    expect(getGuidelineVersion).not.toHaveBeenCalled()
    expect(classifyAiPolicyRequest).not.toHaveBeenCalled()
    expect(workflowFetch).not.toHaveBeenCalled()
  })

  test('legacy workflow inputs do not require or call run coordination', async () => {
    const output = await validateAiWorkflow({})

    expect(output.result).toMatchObject({
      overallOutcome: 'fail',
      humanReviewRequired: true,
    })
    expect(confirmAiRunClaim).not.toHaveBeenCalled()
    expect(getGuidelineVersion).not.toHaveBeenCalled()
    expect(workflowFetch).not.toHaveBeenCalled()
  })

  test('text-only platforms receive pinned Guidelines as untrusted user data', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-generation-1' })
    confirmAiRunClaim.mockImplementationOnce(async () => {
      events.push('claim')
      return { ok: true, coordination: 'local' }
    })
    let providerBody
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      providerBody = body
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
    getGuidelineVersion.mockResolvedValueOnce(legacyCaptionDocument)

    const result = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x', 'facebook'],
      contentType: 'reel_caption',
      runCoordination: { claimId: 'claim-generation-1', coordination: 'local' },
      ...legacy,
      ...runtimeFields(legacyCaptionDocument, 'reel_caption', legacy),
    })

    expect(providerBody.modalities).toEqual(['text'])
    expect(providerBody.image_config).toBeUndefined()
    const providerMessages = providerBody.messages
    const systemPrompt = providerMessages[0].content
    const providerUserText = providerMessages[1].content
    expect(systemPrompt.startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    expect(systemPrompt).not.toContain(legacyCaptionDocument.global)
    expect(systemPrompt).not.toContain('Caption de reel')
    expect(systemPrompt).toContain('Preserva los hechos provistos')
    expect(systemPrompt).toContain('Registra en "assumptions" cualquier supuesto')
    expect(providerUserText).toContain('<GUIDELINES_NO_CONFIABLES>')
    expect(providerUserText).toContain(legacyCaptionDocument.global.split('\n')[0])
    expect(providerUserText).toContain(legacyCaptionDocument.prohibited.split('\n')[0])
    expect(providerUserText).not.toContain('Usa los datos provistos tal como fueron escritos')
    expect(providerUserText).toContain('Caption de reel')
    expect(providerUserText.indexOf('<GUIDELINES_NO_CONFIABLES>')).toBeLessThan(
      providerUserText.indexOf('<SOLICITUD_NO_CONFIABLE>')
    )
    expect(result.result.generatedImage).toBeUndefined()
    expect(result.result.publicationTextSource).toBe('generated')
    expect(events).toEqual(['claim', 'pre-policy', 'model', 'post-policy'])
    expect(confirmAiRunClaim).toHaveBeenCalledWith({
      userId: 'user-1',
      mode: 'generate',
      claimId: 'claim-generation-1',
      runId: 'wrun-generation-1',
      coordination: 'local',
    })
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
        expect(body.modalities).toEqual(['text'])
        expect(body.image_config).toBeUndefined()
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'Un telescopio bajo un cielo familiar y seguro.',
            sharedImageRationale: 'Apoya el tema.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        expect(body.image_config).toEqual({ aspect_ratio: '3:4' })
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
    getGuidelineVersion.mockResolvedValueOnce(legacyCaptionDocument)

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'caption',
      ...legacy,
      ...runtimeFields(legacyCaptionDocument, 'caption', legacy),
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
    getGuidelineVersion.mockResolvedValueOnce(legacyCaptionDocument)

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'caption',
      ...legacy,
      ...runtimeFields(legacyCaptionDocument, 'caption', legacy),
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

  test('preserves a caption policy availability error without calling it an invalid request', async () => {
    workflowFetch.mockResolvedValueOnce(
      openRouterResponse(
        JSON.stringify({
          caption: {
            contentType: 'caption',
            draftText: 'Observa Saturno con la Sociedad de Astronomía del Caribe.',
            assumptions: [],
            missingInformation: [],
          },
          recommendedNextStep: 'Validar antes de publicar.',
          humanReviewRequired: true,
        })
      )
    )
    reviewAiPolicyResult.mockResolvedValueOnce(
      policyDecision('block', {
        stage: 'result',
        evaluatedDecision: 'uncertain',
        categories: ['invalid_request'],
        reason: 'No fue posible confirmar el cumplimiento de la política base.',
        failClosed: true,
        errorCode: 'response_error',
      })
    )
    const legacy = { intent: 'Educar a la comunidad', topic: 'Saturno' }
    getGuidelineVersion.mockResolvedValueOnce(legacyCaptionDocument)

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x'],
      contentType: 'caption',
      ...legacy,
      ...runtimeFields(legacyCaptionDocument, 'caption', legacy),
    })

    expect(output.result.policyReview).toMatchObject({
      stage: 'caption',
      disposition: 'review',
      failClosed: true,
      errorCode: 'response_error',
    })
    expect(output.result.recommendedNextStep).toContain('no se confirmó una infracción')
  })

  test('required visual generation fails closed when no final image can be prepared', async () => {
    const requiredImageDocument = JSON.parse(JSON.stringify(legacyCaptionDocument))
    const caption = requiredImageDocument.contentTypeCatalog.find(({ id }) => id === 'caption')
    caption.visual.imagePolicyByPlatform.instagram = 'required'
    getGuidelineVersion.mockResolvedValueOnce(requiredImageDocument)

    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = body.messages?.[0]?.content || ''
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        expect(body.modalities).toEqual(['text'])
        expect(body.image_config).toBeUndefined()
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

  test('image_only preserves publicationText exactly and skips caption generation and review', async () => {
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
    const publicationText = '  Caption existente\r\n\r\n#Conservar  '

    classifyAiPolicyRequest.mockImplementationOnce(async (payload) => {
      expect(payload.reviewMode).toBe('image_only_generation')
      expect(payload.request).toMatchObject({
        generationMode: 'image_only',
        publicationText,
      })
      return policyDecision('allow', { stage: 'request' })
    })
    reviewAiPolicyResult.mockImplementationOnce(async (payload) => {
      expect(payload.reviewMode).toBe('image_only_generation')
      expect(payload.result.publicationTextSource).toBe('provided')
      expect(payload.result.drafts[0].draftText).toBe(publicationText)
      expect(payload.images).toHaveLength(1)
      return policyDecision('allow', { stage: 'result' })
    })
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = body.messages?.[0]?.content || ''
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        expect(body.modalities).toEqual(['text'])
        expect(body.image_config).toBeUndefined()
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'Binoculares bajo un cielo nocturno; no identifiable faces.',
            sharedImageRationale: 'Apoya el caption existente.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        expect(body.modalities).toEqual(['image', 'text'])
        expect(body.image_config).toEqual({ aspect_ratio: '3:4' })
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar ni revisar un caption')
    })
    const legacy = { topic: 'Binoculares', tone: 'Amigable' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['facebook'],
      contentType: 'post_educativo',
      generationMode: 'image_only',
      publicationText,
      ...legacy,
      ...runtimeFields(document, 'post_educativo', legacy),
    })

    expect(workflowFetch).toHaveBeenCalledTimes(2)
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
    expect(output.result.publicationTextSource).toBe('provided')
    expect(output.result.drafts[0].draftText).toBe(publicationText)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.usage.totalTokens).toBe(4)
  })

  test('image_only event template uses the existing poster-copy fallbacks when its short step fails', async () => {
    const publicationText = 'Caption provisto para el evento.'
    workflowFetch.mockResolvedValue(openRouterResponse('respuesta no JSON'))
    reviewAiPolicyResult.mockImplementationOnce(async (payload) => {
      expect(payload.reviewMode).toBe('image_only_generation')
      expect(payload.images).toHaveLength(1)
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
    }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x', 'instagram', 'facebook'],
      contentType: 'observation_night',
      backgroundMode: 'stock',
      backgroundId: 'telescope-nebula',
      generationMode: 'image_only',
      publicationText,
      ...legacy,
      ...runtimeFields(document, 'observation_night', legacy),
    })

    expect(workflowFetch).toHaveBeenCalledTimes(2)
    for (const [, options] of workflowFetch.mock.calls) {
      const body = JSON.parse(options.body)
      expect(body.modalities).toEqual(['text'])
      expect(body.image_config).toBeUndefined()
    }
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
    expect(output.result.drafts[0].draftText).toBe(publicationText)
    expect(output.result.templateRequest.textFields).toMatchObject({
      subtitle: 'Acompáñanos a descubrir el cielo.',
      body: 'Una noche para observar, aprender y compartir bajo las estrellas.',
    })
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.usage.totalTokens).toBe(4)
  })

  test('image_only simple stock template composes from data without any text provider call', async () => {
    const publicationText = '  Caption ya aprobado.\r\nSegunda línea.  '
    reviewAiPolicyResult.mockImplementationOnce(async (payload) => {
      expect(payload.reviewMode).toBe('image_only_generation')
      expect(payload.images).toHaveLength(1)
      return policyDecision('allow', { stage: 'result' })
    })
    const legacy = { intent: 'Educar', topic: 'Saturno esta semana' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['x', 'instagram', 'facebook'],
      contentType: 'regular_post',
      backgroundMode: 'stock',
      backgroundId: 'telescope-nebula',
      generationMode: 'image_only',
      publicationText,
      ...legacy,
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(workflowFetch).not.toHaveBeenCalled()
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
    expect(output.result.publicationTextSource).toBe('provided')
    expect(output.result.drafts.every((draft) => draft.draftText === publicationText)).toBe(true)
    expect(output.result.templateRequest.textFields.headline).toBe('Saturno esta semana')
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.usage).toBeNull()
  })

  test('image_only treats a missing optional image as a retryable terminal failure', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-image-only-no-image' })
    const publicationText = 'Caption existente.'
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = body.messages?.[0]?.content || ''
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'Cielo nocturno seguro; no identifiable faces.',
            sharedImageRationale: 'Apoya el caption.',
          })
        )
      }
      return openRouterResponse('')
    })
    const legacy = { topic: 'Binoculares', tone: 'Amigable' }

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['facebook'],
        contentType: 'post_educativo',
        generationMode: 'image_only',
        publicationText,
        ...legacy,
        ...runtimeFields(document, 'post_educativo', legacy),
      })
    ).rejects.toThrow('No se pudo preparar la imagen solicitada.')

    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          code: 'required_image_unavailable',
          stage: 'image_generation',
          retryable: true,
          message: expect.stringMatching(/imagen solicitada/i),
        }),
      })
    )
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-image-only-no-image',
      expect.objectContaining({
        code: 'required_image_unavailable',
        stage: 'image_generation',
        retryable: true,
      })
    )
  })

  test('a pre-policy block prevents provider generation and post-review', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-policy-block' })
    classifyAiPolicyRequest.mockImplementationOnce(async () => {
      events.push('pre-policy')
      return policyDecision('block', { stage: 'request' })
    })
    const legacy = { intent: 'Texto fuera de alcance', topic: 'Solicitud' }
    getGuidelineVersion.mockResolvedValueOnce(legacyCaptionDocument)

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['x'],
        contentType: 'reel_caption',
        ...legacy,
        ...runtimeFields(legacyCaptionDocument, 'reel_caption', legacy),
      })
    ).rejects.toThrow(/revisión confirmó un problema de contenido/i)

    expect(events).toEqual(['pre-policy'])
    expect(workflowFetch).not.toHaveBeenCalled()
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-policy-block',
      expect.not.objectContaining({ message: expect.stringContaining('No cumple') })
    )
  })

  test('reports a wrong policy-review modality without calling it a content violation', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-policy-wrong-modality' })
    classifyAiPolicyRequest.mockImplementationOnce(async () => {
      events.push('pre-policy')
      return policyDecision('block', {
        stage: 'request',
        evaluatedDecision: 'uncertain',
        categories: ['invalid_request'],
        reason: 'No fue posible confirmar el cumplimiento de la política base.',
        failClosed: true,
        errorCode: 'wrong_modality',
      })
    })
    const legacy = { intent: 'Educar a la comunidad', topic: 'Binoculares vs. telescopios' }
    getGuidelineVersion.mockResolvedValueOnce(legacyCaptionDocument)

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['x'],
        contentType: 'reel_caption',
        ...legacy,
        ...runtimeFields(legacyCaptionDocument, 'reel_caption', legacy),
      })
    ).rejects.toThrow(
      'La revisión automática respondió con una imagen cuando debía responder con texto. No se confirmó una infracción y la generación no llegó a comenzar.'
    )

    expect(events).toEqual(['pre-policy'])
    expect(workflowFetch).not.toHaveBeenCalled()
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-policy-wrong-modality',
      expect.objectContaining({
        code: 'policy_review_wrong_modality',
        stage: 'request_policy',
        retryable: true,
      })
    )
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
    ).rejects.toThrow(/guías seleccionadas.*no están disponibles/i)

    expect(events).toEqual([])
    expect(workflowFetch).not.toHaveBeenCalled()
    expect(classifyAiPolicyRequest).not.toHaveBeenCalled()
  })
})
