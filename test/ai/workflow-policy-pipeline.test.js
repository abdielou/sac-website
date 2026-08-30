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
const { GenerateInputSchema } = require('../../lib/ai-generation-schemas')
const {
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
  return new Response(
    JSON.stringify({
      id: 'generation-workflow-1',
      model: 'test/multimodal',
      provider: 'test',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content,
            ...(images
              ? {
                  images: images.map((image) => ({ type: 'image_url', ...image })),
                }
              : null),
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function openRouterErrorResponse(status) {
  return new Response(JSON.stringify({ error: { message: 'provider detail must stay private' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function messageContentText(message) {
  if (typeof message?.content === 'string') return message.content
  return (message?.content || [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

function messagesText(body) {
  return (body.messages || [])
    .map((message) =>
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    )
    .join('\n')
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
        visual: {
          mode: 'ai_image',
          template: null,
          backgroundSources: [],
          sponsorAllowed: false,
          imagePolicyByPlatform: {
            x: 'optional',
            instagram: 'optional',
            facebook: 'optional',
          },
        },
      }
    }
    if (entry.id === 'reel_caption') {
      return {
        ...entry,
        validation: { rules: 'Validar el caption del reel contra la información provista.' },
        generation: { rules: 'Caption de reel: generar texto breve para un reel existente.' },
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
    }
    return entry
  })
  return fixture
}

function withAiImageType(document, { id, label, generationRules }) {
  let fixture = createContentType(document, { id, label })
  fixture.contentTypeCatalog = fixture.contentTypeCatalog.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          validation: { rules: `Validar ${label} contra la información provista.` },
          generation: { rules: generationRules },
          visual: {
            mode: 'ai_image',
            template: null,
            backgroundSources: [],
            sponsorAllowed: false,
            imagePolicyByPlatform: {
              x: 'optional',
              instagram: 'required',
              facebook: 'optional',
            },
          },
        }
      : entry
  )
  return fixture
}

async function makePngDataUrl({ r = 9, g = 20, b = 55 } = {}) {
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

async function readCenterRgb(dataUrl) {
  const encoded = String(dataUrl).split(',')[1]
  const { data, info } = await sharp(Buffer.from(encoded, 'base64'))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const x = Math.floor(info.width / 2)
  const y = Math.floor(info.height / 2)
  const offset = (y * info.width + x) * info.channels
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
}

describe('workflow policy pipeline', () => {
  const document = getDefaultGuidelines()
  const legacyCaptionDocument = withLegacyCaptionTypes(document)
  let events
  const originalApiKey = process.env.OPENROUTER_API_KEY
  const originalModel = process.env.OPENROUTER_MODEL

  beforeEach(() => {
    jest.resetAllMocks()
    events = []
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_MODEL = 'google/gemini-3.1-flash-lite-image'
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
    let providerOptions
    workflowFetch.mockImplementation(async (_url, options) => {
      events.push('model')
      providerOptions = options
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
    expect(providerBody.model).toBe('google/gemini-3.1-flash-lite')
    expect(providerBody.max_tokens).toBe(2000)
    expect(providerOptions.signal).toBeDefined()
    expect(providerOptions.signal.aborted).toBe(false)
    expect(providerBody.image_config).toBeUndefined()
    const providerMessages = providerBody.messages
    expect(messageContentText(providerMessages[0]).startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    expect(messageContentText(providerMessages[0])).not.toContain('<GUIDELINES_NO_CONFIABLES>')
    expect(messageContentText(providerMessages[0])).toContain('Si "issues" está vacío')
    expect(messageContentText(providerMessages[0])).toContain('No repitas el borrador original')
    expect(messageContentText(providerMessages[0])).toContain('textCorrections')
    expect(messageContentText(providerMessages[0])).toContain(
      'Reporta una sola vez cada problema conceptual'
    )
    expect(messageContentText(providerMessages[0])).toContain('"suggestion"')
    expect(messageContentText(providerMessages[0])).toContain('"imageNotesByImage"')
    const providerUserText = messageContentText(providerMessages[1])
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
              textCorrections: [{ before: 'Acompananos', after: 'Acompáñanos' }],
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

  test('repairs incomplete correction anchors and deduplicates equivalent findings', async () => {
    const draftText = 'Sociedad Astronomica del Caribe\n\nTelescopias para explorar el cielo.'
    const suggestedRevision =
      'Sociedad de Astronomía del Caribe\n\nTelescopios para explorar el cielo.'
    const incompleteResult = {
      summary: 'Se encontraron tres errores.',
      issues: [
        {
          severity: 'minor',
          category: 'guideline_compliance',
          message:
            'El nombre de la institución aparece como Sociedad Astronomica del Caribe, omitiendo la tilde en Astronomía.',
          suggestedFix: 'Cambiar a Sociedad de Astronomía del Caribe.',
          affectedPlatform: 'facebook',
          textCorrections: [{ before: 'Astronomica', after: 'Astronomía' }],
        },
        {
          severity: 'minor',
          category: 'guideline_compliance',
          message: 'Error ortográfico en el subtítulo: Telescopias.',
          suggestedFix: 'Cambiar a Telescopios.',
          affectedPlatform: 'facebook',
          textCorrections: [{ before: 'Telescopias', after: 'Telescopios' }],
        },
        {
          severity: 'minor',
          category: 'clarity',
          message: 'La redacción en la frase inicial del subtítulo de telescopios es incorrecta.',
          suggestedFix: 'Cambiar Telescopias por Telescopios.',
          affectedPlatform: 'facebook',
          textCorrections: [{ before: 'Telescopias', after: 'Telescopios' }],
        },
      ],
      suggestedRevision,
    }
    const repairedResult = {
      summary: 'El borrador necesita dos correcciones.',
      issues: [
        {
          severity: 'minor',
          category: 'guideline_compliance',
          message:
            'El nombre institucional no coincide con el oficial: Sociedad Astronomica del Caribe debe decir Sociedad de Astronomía del Caribe.',
          affectedPlatform: 'facebook',
          textCorrections: [
            {
              before: 'Sociedad Astronomica del Caribe',
              after: 'Sociedad de Astronomía del Caribe',
            },
          ],
        },
        {
          severity: 'minor',
          category: 'guideline_compliance',
          message: 'Telescopias es un error ortográfico; debe decir Telescopios.',
          affectedPlatform: 'facebook',
          textCorrections: [{ before: 'Telescopias', after: 'Telescopios' }],
        },
      ],
      suggestedRevision,
    }
    workflowFetch
      .mockResolvedValueOnce(openRouterResponse(JSON.stringify(incompleteResult)))
      .mockResolvedValueOnce(openRouterResponse(JSON.stringify(repairedResult)))
    const legacy = { intent: 'Validar ortografía', topic: 'Telescopios' }

    const output = await validateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platform: 'facebook',
      contentType: 'regular_post',
      draftText,
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(workflowFetch).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(workflowFetch.mock.calls[1][1].body)
    expect(messageContentText(retryBody.messages[0])).toContain('CORRECCIÓN DE CONTRATO')
    expect(messagesText(retryBody)).toContain('Sociedad Astronomica del Caribe')
    expect(messagesText(retryBody)).toContain(
      'Las correcciones de los hallazgos no reconstruyen el texto corregido'
    )

    expect(output.result).toMatchObject({
      overallOutcome: 'warning',
      approvalRecommendation: 'needs_edits',
      suggestedRevision,
    })
    expect(output.result.issues).toHaveLength(2)
    expect(output.result.issues[0].message).toContain('Sociedad Astronomica del Caribe')
    expect(output.result.issues[0].message).toContain('Sociedad de Astronomía del Caribe')
    expect(
      output.result.issues.filter((issue) =>
        `${issue.message} ${issue.suggestedFix || ''}`.includes('Telescopias')
      )
    ).toHaveLength(1)
    expect(reviewAiPolicyResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ issues: output.result.issues }),
      }),
      expect.any(Object)
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

  test('fails after retrying an unexplained material revision and persists terminal metadata', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-validation-invalid-response' })
    workflowFetch.mockImplementation(async () =>
      openRouterResponse(
        JSON.stringify({
          summary: 'No se detectaron problemas.',
          issues: [],
          suggestedRevision: 'Un texto materialmente diferente.',
        })
      )
    )
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    await expect(
      validateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platform: 'facebook',
        contentType: 'regular_post',
        draftText: 'Texto original.',
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow(/respuesta inválida/i)

    expect(workflowFetch).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(workflowFetch.mock.calls[1][1].body)
    expect(messageContentText(retryBody.messages[0])).toContain('CORRECCIÓN DE CONTRATO')
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'wrun-validation-invalid-response',
        status: 'failed',
        error: expect.objectContaining({
          code: 'validation_model_invalid_response',
          stage: 'validation_model',
          retryable: true,
        }),
      })
    )
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-validation-invalid-response',
      expect.objectContaining({
        code: 'validation_model_invalid_response',
        retryable: true,
      })
    )
  })

  test('does not retry a non-transient validation provider rejection', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-validation-provider-rejected' })
    workflowFetch.mockImplementation(async () => openRouterErrorResponse(400))
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    await expect(
      validateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platform: 'facebook',
        contentType: 'regular_post',
        draftText: 'Texto original.',
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow(/problema de configuración/i)

    expect(workflowFetch).toHaveBeenCalledTimes(1)
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          code: 'validation_provider_rejected',
          retryable: false,
        }),
      })
    )
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-validation-provider-rejected',
      expect.objectContaining({ code: 'validation_provider_rejected', retryable: false })
    )
  })

  test('retries one transient validation provider failure before failing recoverably', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-validation-provider-unavailable' })
    workflowFetch.mockImplementation(async () => openRouterErrorResponse(503))
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    await expect(
      validateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platform: 'facebook',
        contentType: 'regular_post',
        draftText: 'Texto original.',
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow(/intenta nuevamente/i)

    expect(workflowFetch).toHaveBeenCalledTimes(2)
    expect(persistRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          code: 'validation_provider_unavailable',
          retryable: true,
        }),
      })
    )
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-validation-provider-unavailable',
      expect.objectContaining({ code: 'validation_provider_unavailable', retryable: true })
    )
  })

  test('fails without a provider call when validation configuration is missing', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-validation-missing-config' })
    delete process.env.OPENROUTER_API_KEY
    const legacy = { intent: 'Validar claridad', topic: 'Saturno' }

    await expect(
      validateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platform: 'facebook',
        contentType: 'regular_post',
        draftText: 'Texto original.',
        ...runtimeFields(document, 'regular_post', legacy),
      })
    ).rejects.toThrow(/problema de configuración/i)

    expect(workflowFetch).not.toHaveBeenCalled()
    expect(persistRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          code: 'validation_provider_configuration_error',
          retryable: false,
        }),
      })
    )
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-validation-missing-config',
      expect.objectContaining({
        code: 'validation_provider_configuration_error',
        retryable: false,
      })
    )
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
              textCorrections: [
                {
                  before: 'Sociedad Astronomica del Caribe',
                  after: 'Sociedad de Astronomía del Caribe',
                },
              ],
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
              textCorrections: [{ before: 'Texto con error', after: 'Texto corregido' }],
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
    expect(output.result.issues[0].message).toMatch(/(?:falta|error) ortográfico/i)
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
    expect(providerBody.model).toBe('google/gemini-3.1-flash-lite')
    expect(providerBody.image_config).toBeUndefined()
    const providerMessages = providerBody.messages
    const systemPrompt = messageContentText(providerMessages[0])
    const providerUserText = messageContentText(providerMessages[1])
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
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        expect(body.model).toBe('google/gemini-3.1-flash-lite')
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
        expect(body.model).toBe('google/gemini-3.1-flash-lite-image')
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

  test('passes the exact pinned image rules to both visual models without automatic text directives', async () => {
    const exactRules =
      '- Genera una imagen relacionada al tema de las felicitaciones\n- Que la imagen contenga con una tipografía legible las felicitaciones'
    const contentType = 'occasion_rules_are_data'
    const greetingDocument = withAiImageType(document, {
      id: contentType,
      label: 'Ocasión configurable',
      generationRules: exactRules,
    })
    getGuidelineVersion.mockResolvedValueOnce(greetingDocument)

    const dataUrl = await makePngDataUrl()
    let imagePromptMessages = ''
    let imageAssetMessages = ''

    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        imagePromptMessages = messagesText(body)
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt:
              'Warm astronomy celebration poster with the readable headline "Felicitaciones a nuestra comunidad"; no identifiable faces.',
            sharedImageRationale: 'Sigue las reglas de la ocasión provista.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageAssetMessages = messagesText(body)
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    reviewAiPolicyResult.mockResolvedValueOnce(policyDecision('allow', { stage: 'result' }))
    const legacy = {
      intent: 'Felicitar a la comunidad',
      topic: 'Una ocasión elegida por el editor',
    }

    const request = {
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType,
      generationMode: 'image_only',
      publicationText: 'Hoy celebramos junto a toda nuestra comunidad.',
      ...legacy,
      ...runtimeFields(greetingDocument, contentType, legacy),
    }
    GenerateInputSchema.parse(request)
    const output = await generateAiWorkflow(request)

    const serializedExactRules = JSON.stringify(exactRules).slice(1, -1)
    expect(imagePromptMessages).toContain(serializedExactRules)
    expect(imageAssetMessages).toContain(serializedExactRules)
    expect(`${imagePromptMessages}\n${imageAssetMessages}`).not.toMatch(
      /TEXTO EN IMAGEN: (?:REQUERIDO|NO SOLICITADO)/
    )
    expect(`${imagePromptMessages}\n${imageAssetMessages}`).not.toContain(
      'No unrequested text overlay.'
    )
    expect(imageAssetMessages).not.toContain('Required on-image text:')
    expect(workflowFetch).toHaveBeenCalledTimes(2)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
  })

  test('preserves an arbitrary explicit no-text rule for both visual models', async () => {
    const exactRules =
      'REGLA ZETA-47: La imagen debe ser una ilustración abstracta y debe presentarse sin texto, letras, números ni logotipos.'
    const contentType = 'zeta_47'
    const noTextDocument = withAiImageType(document, {
      id: contentType,
      label: 'Zeta 47',
      generationRules: exactRules,
    })
    getGuidelineVersion.mockResolvedValueOnce(noTextDocument)

    const dataUrl = await makePngDataUrl({ r: 18, g: 35, b: 70 })
    const visualModelMessages = []
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        visualModelMessages.push(messagesText(body))
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt:
              'Abstract deep-space forms, no text, letters, numbers, logos, or identifiable people.',
            sharedImageRationale: 'Conserva literalmente la restricción visual provista.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        visualModelMessages.push(messagesText(body))
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    const legacy = { intent: 'Compartir una pieza abstracta', topic: 'Materia interestelar' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType,
      generationMode: 'image_only',
      publicationText: 'Materia interestelar en movimiento.',
      ...legacy,
      ...runtimeFields(noTextDocument, contentType, legacy),
    })

    expect(visualModelMessages).toHaveLength(2)
    const serializedExactRules = JSON.stringify(exactRules).slice(1, -1)
    expect(visualModelMessages[0]).toContain(serializedExactRules)
    expect(visualModelMessages[1]).toContain(serializedExactRules)
    expect(visualModelMessages.join('\n')).not.toMatch(/TEXTO EN IMAGEN:/)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
  })

  test('keeps the generic no-text exception for an AI-generated template backdrop', async () => {
    const dataUrl = await makePngDataUrl({ r: 4, g: 12, b: 38 })
    let backdropMessages = ''
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'A layered view of Saturn with ample central negative space.',
            sharedImageRationale: 'Fondo para el titular que compondrá la plantilla.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        backdropMessages = messagesText(body)
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    const legacy = { intent: 'Educar', topic: 'Saturno esta semana' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'regular_post',
      backgroundMode: 'ai_generated',
      generationMode: 'image_only',
      publicationText: 'Saturno esta semana.',
      ...legacy,
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(backdropMessages).toMatch(/fondo limpio|clean background/i)
    expect(backdropMessages).toMatch(/no text|sin texto/i)
    expect(output.result.templateRequest.textFields.headline).toBe('Saturno esta semana')
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
  })

  test('regenerates an AI template backdrop when the first file cannot be rendered', async () => {
    const validDataUrl = await makePngDataUrl({ r: 7, g: 18, b: 48 })
    let backdropAttempts = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'A clean layered background with ample central negative space.',
            sharedImageRationale: 'Fondo neutro para el texto definido por la plantilla.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        backdropAttempts += 1
        const dataUrl = backdropAttempts === 1 ? 'data:image/png;base64,QUFBQQ==' : validDataUrl
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    const legacy = { intent: 'Educar', topic: 'Tema definido por Guidelines' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType: 'regular_post',
      backgroundMode: 'ai_generated',
      generationMode: 'image_only',
      publicationText: 'Texto existente.',
      ...legacy,
      ...runtimeFields(document, 'regular_post', legacy),
    })

    expect(backdropAttempts).toBe(2)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(persistAiRunFailure).not.toHaveBeenCalled()
  })

  test('retries one ai_image after guideline-only noncompliance and returns the corrected image', async () => {
    const contentType = 'generic_visual_retry'
    const rules = 'Incluye una representación visual clara del concepto indicado por el editor.'
    const retryDocument = withAiImageType(document, {
      id: contentType,
      label: 'Visual genérico',
      generationRules: rules,
    })
    getGuidelineVersion.mockResolvedValueOnce(retryDocument)
    const firstDataUrl = await makePngDataUrl({ r: 90, g: 10, b: 10 })
    const secondDataUrl = await makePngDataUrl({ r: 10, g: 90, b: 10 })
    const imageRequests = []

    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'A physically plausible telescope under a clear night sky.',
            sharedImageRationale: 'Representa el concepto provisto.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageRequests.push(messagesText(body))
        const image = imageRequests.length === 1 ? firstDataUrl : secondDataUrl
        return openRouterResponse('', [{ image_url: { url: image } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    reviewAiPolicyResult
      .mockResolvedValueOnce(
        policyDecision('block', {
          stage: 'result',
          categories: ['guideline_noncompliance', 'guideline_noncompliance'],
          reason: 'La primera imagen omitió el concepto visual solicitado.',
        })
      )
      .mockResolvedValueOnce(policyDecision('allow', { stage: 'result' }))
    const legacy = { intent: 'Explicar un concepto', topic: 'Montura ecuatorial' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType,
      generationMode: 'image_only',
      publicationText: 'Conoce cómo funciona una montura ecuatorial.',
      ...legacy,
      ...runtimeFields(retryDocument, contentType, legacy),
    })

    expect(imageRequests).toHaveLength(2)
    expect(imageRequests[1]).toContain(rules)
    expect(imageRequests[1]).toContain('A physically plausible telescope under a clear night sky.')
    expect(imageRequests[1]).toContain('La primera imagen omitió el concepto visual solicitado.')
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(2)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    const correctedPixel = await readCenterRgb(output.result.generatedImage.dataUrl)
    expect(correctedPixel.g).toBeGreaterThan(correctedPixel.r)
    expect(correctedPixel.g).toBeGreaterThan(correctedPixel.b)
    expect(output.result.policyReview).toBeUndefined()
  })

  test('returns the second ai_image with a warning after one failed guideline retry', async () => {
    const contentType = 'generic_visual_retry_warning'
    const retryDocument = withAiImageType(document, {
      id: contentType,
      label: 'Visual genérico con revisión',
      generationRules: 'Representa el tema central de forma inequívoca.',
    })
    getGuidelineVersion.mockResolvedValueOnce(retryDocument)
    const imageDataUrls = [
      await makePngDataUrl({ r: 70, g: 10, b: 20 }),
      await makePngDataUrl({ r: 20, g: 10, b: 70 }),
    ]
    let imageCalls = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'A generic educational astronomy scene.',
            sharedImageRationale: 'Apoya el tema.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        const dataUrl = imageDataUrls[imageCalls]
        imageCalls += 1
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    reviewAiPolicyResult
      .mockResolvedValueOnce(
        policyDecision('block', {
          stage: 'result',
          categories: ['guideline_noncompliance'],
          reason: 'La primera imagen no representa el tema central.',
        })
      )
      .mockResolvedValueOnce(
        policyDecision('block', {
          stage: 'result',
          categories: ['guideline_noncompliance'],
          reason: 'La segunda imagen todavía no representa el tema central.',
        })
      )
    const legacy = { intent: 'Educar', topic: 'Espectroscopía' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType,
      generationMode: 'image_only',
      publicationText: 'Introducción a la espectroscopía.',
      ...legacy,
      ...runtimeFields(retryDocument, contentType, legacy),
    })

    expect(imageCalls).toBe(2)
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(2)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    const reviewedPixel = await readCenterRgb(output.result.generatedImage.dataUrl)
    expect(reviewedPixel.b).toBeGreaterThan(reviewedPixel.r)
    expect(reviewedPixel.b).toBeGreaterThan(reviewedPixel.g)
    expect(output.result.policyReview).toMatchObject({
      stage: 'result',
      disposition: 'review',
      categories: ['guideline_noncompliance'],
      reason: 'La segunda imagen todavía no representa el tema central.',
    })
  })

  test('keeps the first ai_image and warning when the guideline retry fails technically', async () => {
    const contentType = 'generic_visual_retry_failure'
    const retryDocument = withAiImageType(document, {
      id: contentType,
      label: 'Visual con fallback',
      generationRules: 'La escena debe mostrar claramente el tema provisto.',
    })
    getGuidelineVersion.mockResolvedValueOnce(retryDocument)
    const firstDataUrl = await makePngDataUrl({ r: 30, g: 40, b: 80 })
    let imageCalls = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'A safe astronomy scene.',
            sharedImageRationale: 'Apoya el tema.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageCalls += 1
        return imageCalls === 1
          ? openRouterResponse('', [{ image_url: { url: firstDataUrl } }])
          : openRouterResponse('')
      }
      throw new Error('image_only no debe generar un caption')
    })
    reviewAiPolicyResult.mockResolvedValueOnce(
      policyDecision('block', {
        stage: 'result',
        categories: ['guideline_noncompliance'],
        reason: 'La primera imagen omitió un requisito visual.',
      })
    )
    const legacy = { intent: 'Educar', topic: 'Óptica' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType,
      generationMode: 'image_only',
      publicationText: 'Conceptos básicos de óptica.',
      ...legacy,
      ...runtimeFields(retryDocument, contentType, legacy),
    })

    expect(imageCalls).toBe(3)
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    const fallbackPixel = await readCenterRgb(output.result.generatedImage.dataUrl)
    expect(fallbackPixel.b).toBeGreaterThan(fallbackPixel.r)
    expect(fallbackPixel.b).toBeGreaterThan(fallbackPixel.g)
    expect(output.result.policyReview).toMatchObject({
      disposition: 'review',
      categories: ['guideline_noncompliance'],
      reason: 'La primera imagen omitió un requisito visual.',
    })
    expect(output.usage.totalTokens).toBe(8)
  })

  test.each([
    {
      name: 'hard safety block',
      decision: {
        categories: ['sexual_content'],
        reason: 'La imagen incumple la política de seguridad.',
      },
    },
    {
      name: 'mixed block',
      decision: {
        categories: ['guideline_noncompliance', 'unrelated_image'],
        reason: 'La imagen tiene incumplimientos de categorías mixtas.',
      },
    },
    {
      name: 'inconclusive reviewer',
      decision: {
        categories: ['guideline_noncompliance'],
        reason: 'No fue posible concluir la revisión.',
        failClosed: true,
        evaluatedDecision: 'uncertain',
        errorCode: 'response_error',
      },
    },
  ])('does not retry an ai_image after a $name', async ({ decision }) => {
    const contentType = 'generic_visual_no_retry'
    const noRetryDocument = withAiImageType(document, {
      id: contentType,
      label: 'Visual sin retry',
      generationRules: 'Representa de forma segura el tema indicado.',
    })
    getGuidelineVersion.mockResolvedValueOnce(noRetryDocument)
    const dataUrl = await makePngDataUrl({ r: 20, g: 30, b: 40 })
    let imageCalls = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'A safe astronomy image.',
            sharedImageRationale: 'Apoya el tema.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageCalls += 1
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    reviewAiPolicyResult.mockResolvedValueOnce(
      policyDecision('block', { stage: 'result', ...decision })
    )
    const legacy = { intent: 'Educar', topic: 'Astronomía segura' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['instagram'],
      contentType,
      generationMode: 'image_only',
      publicationText: 'Una publicación educativa.',
      ...legacy,
      ...runtimeFields(noRetryDocument, contentType, legacy),
    })

    expect(imageCalls).toBe(1)
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
    expect(output.result.policyReview).toMatchObject({
      categories: decision.categories,
      reason: decision.reason,
    })
  })

  test('blocks a caption with fabricated facts before spending on image generation', async () => {
    workflowFetch.mockImplementation(async (_url, options) => {
      events.push('model')
      const body = JSON.parse(options.body)
      expect(body.modalities || []).not.toContain('image')
      expect(messageContentText(body.messages?.[0])).not.toContain(
        'INSTRUCCIONES OPERATIVAS DE IMAGEN'
      )
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

  test('required visual generation explains when automatic provider recovery is exhausted', async () => {
    const requiredImageDocument = JSON.parse(JSON.stringify(legacyCaptionDocument))
    const caption = requiredImageDocument.contentTypeCatalog.find(({ id }) => id === 'caption')
    caption.visual.imagePolicyByPlatform.instagram = 'required'
    getGuidelineVersion.mockResolvedValueOnce(requiredImageDocument)

    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        expect(body.model).toBe('google/gemini-3.1-flash-lite')
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
        expect(body.model).toBe('google/gemini-3.1-flash-lite-image')
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
    ).rejects.toThrow(/intentos automáticos/i)

    expect(events).toEqual(['pre-policy', 'post-policy'])
    expect(reviewAiPolicyResult).toHaveBeenCalledTimes(1)
    expect(
      workflowFetch.mock.calls.filter(([, options]) =>
        JSON.parse(options.body).modalities?.includes('image')
      )
    ).toHaveLength(3)
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
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        expect(body.model).toBe('google/gemini-3.1-flash-lite')
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
        expect(body.model).toBe('google/gemini-3.1-flash-lite-image')
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
    workflowFetch.mockImplementation(async () => openRouterResponse('respuesta no JSON'))
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
      expect(messageContentText(body.messages?.[0])).toContain(
        'INSTRUCCIONES OPERATIVAS PARA TEXTO BREVE DE AFICHE'
      )
      expect(body.model).toBe('google/gemini-3.1-flash-lite')
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

  test('image_only reports the exhausted image-provider stage after automatic recovery', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-image-only-no-image' })
    const publicationText = 'Caption existente.'
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
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
    ).rejects.toThrow(
      /OpenRouter no devolvió una imagen utilizable después de los intentos automáticos/
    )

    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          code: 'image_provider_retry_exhausted',
          stage: 'image_provider',
          retryable: true,
          message: expect.stringMatching(/intentos automáticos/i),
        }),
      })
    )
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-image-only-no-image',
      expect.objectContaining({
        code: 'image_provider_retry_exhausted',
        stage: 'image_provider',
        retryable: true,
      })
    )
  })

  test('image_only explains missing provider configuration without offering a futile retry', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-image-provider-not-configured' })
    delete process.env.OPENROUTER_API_KEY
    const legacy = { topic: 'Binoculares', tone: 'Amigable' }

    await expect(
      generateAiWorkflow({
        userId: 'user-1',
        userEmail: 'test@example.com',
        platforms: ['facebook'],
        contentType: 'post_educativo',
        generationMode: 'image_only',
        publicationText: 'Caption existente.',
        ...legacy,
        ...runtimeFields(document, 'post_educativo', legacy),
      })
    ).rejects.toThrow(/proveedor de imágenes no está configurado/i)

    expect(workflowFetch).not.toHaveBeenCalled()
    expect(reviewAiPolicyResult).not.toHaveBeenCalled()
    expect(persistAiRunFailure).toHaveBeenCalledWith(
      'wrun-image-provider-not-configured',
      expect.objectContaining({
        code: 'image_provider_not_configured',
        stage: 'image_prompt',
        retryable: false,
        message: expect.stringMatching(/administrador debe añadir la credencial/i),
      })
    )
  })

  test('image_only rebuilds a safe prompt locally after two invalid brief responses', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-image-only-prompt-recovered' })
    const dataUrl = await makePngDataUrl({ r: 22, g: 33, b: 77 })
    let promptAttempts = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        promptAttempts += 1
        return openRouterResponse(
          JSON.stringify({ visualBrief: { concept: `Incomplete ${promptAttempts}` } })
        )
      }
      if (body.modalities?.includes('image')) {
        expect(messagesText(body)).toContain('Primary subject: visually represent Binoculares')
        expect(messagesText(body)).toContain('Guidelines generation requirements:')
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      return openRouterResponse('')
    })
    const legacy = { topic: 'Binoculares', tone: 'Amigable' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['facebook'],
      contentType: 'post_educativo',
      generationMode: 'image_only',
      publicationText: 'Caption existente.',
      ...legacy,
      ...runtimeFields(document, 'post_educativo', legacy),
    })

    expect(promptAttempts).toBe(2)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(output.result.drafts[0].imageRationale).toMatch(/reconstruyó un brief visual seguro/i)
    expect(persistAiRunFailure).not.toHaveBeenCalled()
  })

  test('regenerates once when the provider image cannot be prepared', async () => {
    getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun-image-postprocess-recovered' })
    const validDataUrl = await makePngDataUrl({ r: 14, g: 44, b: 88 })
    let imageAttempts = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'Un cielo nocturno físicamente plausible y sin texto.',
            sharedImageRationale: 'Representa el tema sin inventar hechos.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageAttempts += 1
        const dataUrl = imageAttempts === 1 ? 'data:image/png;base64,QUFBQQ==' : validDataUrl
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      return openRouterResponse('')
    })
    const legacy = { topic: 'Binoculares', tone: 'Amigable' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['facebook'],
      contentType: 'post_educativo',
      generationMode: 'image_only',
      publicationText: 'Caption existente.',
      ...legacy,
      ...runtimeFields(document, 'post_educativo', legacy),
    })

    expect(imageAttempts).toBe(2)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(persistAiRunFailure).not.toHaveBeenCalled()
  })

  test('keeps provider and preparation recovery budgets independent', async () => {
    const validDataUrl = await makePngDataUrl({ r: 18, g: 48, b: 96 })
    let imageAttempts = 0
    workflowFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      const system = messageContentText(body.messages?.[0])
      if (system.includes('INSTRUCCIONES OPERATIVAS DE IMAGEN')) {
        return openRouterResponse(
          JSON.stringify({
            sharedImagePrompt: 'One coherent visual based only on the confirmed request details.',
            sharedImageRationale: 'Respeta la definición seleccionada en Guidelines.',
          })
        )
      }
      if (body.modalities?.includes('image')) {
        imageAttempts += 1
        if (imageAttempts <= 2) return openRouterResponse('')
        const dataUrl = imageAttempts === 3 ? 'data:image/png;base64,QUFBQQ==' : validDataUrl
        return openRouterResponse('', [{ image_url: { url: dataUrl } }])
      }
      throw new Error('image_only no debe generar un caption')
    })
    const legacy = { topic: 'Binoculares', tone: 'Amigable' }

    const output = await generateAiWorkflow({
      userId: 'user-1',
      userEmail: 'test@example.com',
      platforms: ['facebook'],
      contentType: 'post_educativo',
      generationMode: 'image_only',
      publicationText: 'Caption existente.',
      ...legacy,
      ...runtimeFields(document, 'post_educativo', legacy),
    })

    expect(imageAttempts).toBe(4)
    expect(output.result.generatedImage?.preparedForDisplay).toBe(true)
    expect(persistAiRunFailure).not.toHaveBeenCalled()
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
