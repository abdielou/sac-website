import { AI_AGENT_IDENTITY_PROMPT, AI_AGENT_IDENTITY_VERSION } from '../../lib/ai-agent'
import {
  AI_POLICY_REVIEW_CATEGORIES,
  classifyAiPolicyRequest,
  reviewAiPolicyResult,
} from '../../lib/ai-policy-review'

const SAFE_REQUEST = {
  intent: 'Promover una noche de observación de SAC.',
  topic: 'Saturno',
}

function openRouterResponse(decision, overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      id: 'generation-policy-1',
      model: overrides.responseModel || 'test/multimodal',
      choices: [
        {
          message: {
            content: overrides.content === undefined ? JSON.stringify(decision) : overrides.content,
            ...(overrides.images ? { images: overrides.images } : null),
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    }),
  }
}

function allowDecision(reason = 'Cumple la política base.') {
  return { decision: 'allow', categories: [], reason }
}

describe('classifyAiPolicyRequest', () => {
  test('injects fetch, model, and API key while keeping the agent identity first', async () => {
    const fetchImpl = jest.fn(async () => openRouterResponse(allowDecision()))

    const result = await classifyAiPolicyRequest(
      {
        request: SAFE_REQUEST,
        guidelines: { global: 'Usar un tono educativo.' },
      },
      {
        fetchImpl,
        model: 'test/multimodal',
        apiKey: 'test-key',
      }
    )

    expect(result).toMatchObject({
      policyVersion: AI_AGENT_IDENTITY_VERSION,
      stage: 'request',
      decision: 'allow',
      evaluatedDecision: 'allow',
      failClosed: false,
      model: 'test/multimodal',
    })
    expect(result.usage).toMatchObject({ model: 'test/multimodal', totalTokens: 15 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, options] = fetchImpl.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer test-key')
    expect(body.model).toBe('test/multimodal')
    expect(body.modalities).toEqual(['text'])
    expect(body.image_config).toBeUndefined()
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content.startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    expect(body.messages[0].content).not.toContain('Usar un tono educativo.')
    expect(body.messages[1].content[0].text).toContain('<GUIDELINES_NO_CONFIABLES>')
    expect(body.messages[1].content[0].text).toContain('<SOLICITUD_NO_CONFIABLE>')
  })

  test('defers thematic image relevance until a real holiday image exists', async () => {
    const fetchImpl = jest.fn(async () =>
      openRouterResponse({
        decision: 'block',
        categories: ['unrelated_image'],
        reason: 'Un pavo no es un objeto astronómico.',
      })
    )

    const result = await classifyAiPolicyRequest(
      {
        request: {
          contentType: 'holiday',
          intent: 'Felicitar a la comunidad de SAC por Acción de Gracias.',
          topic: 'Día de Acción de Gracias',
          imageStyle: 'Ilustración festiva con un pavo.',
        },
        guidelines: {
          contentType: 'Celebraciones y días festivos para la comunidad de SAC.',
        },
        images: [],
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'allow',
      evaluatedDecision: 'allow',
      categories: [],
      failClosed: false,
    })
    expect(result.reason).toMatch(/resultado real/i)

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages[0].content).toContain('Motivos culturales, estacionales')
    expect(body.messages[0].content).toContain('no exijas que cada objeto sea astronómico')
    expect(body.messages[0].content).toContain('Guidelines puede imponer restricciones visuales')
    expect(body.messages[0].content).toContain('dirección creativa parcial')
  })

  test('keeps Guidelines findings inside the validator in validation mode', async () => {
    const fetchImpl = jest.fn(async () => openRouterResponse(allowDecision()))

    await classifyAiPolicyRequest(
      {
        request: { ...SAFE_REQUEST, draftText: 'Un borrador que será validado.' },
        guidelines: { global: 'Revisar ortografía.' },
        images: [],
        reviewMode: 'validation',
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages[0].content).toContain('pide VALIDAR un borrador')
    expect(body.messages[0].content).toContain('No uses guideline_noncompliance')
  })

  test('scopes image-only reviews to the visual result without rewriting provided text', async () => {
    const bodies = []
    const fetchImpl = jest.fn(async (_url, options) => {
      bodies.push(JSON.parse(options.body))
      return openRouterResponse(allowDecision())
    })
    const request = {
      ...SAFE_REQUEST,
      generationMode: 'image_only',
      publicationText: '🔭 Binoculares vs. telescopios\n\nTexto ya escrito.',
    }
    const dependencies = { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }

    await classifyAiPolicyRequest(
      {
        request,
        guidelines: { image: 'La imagen debe relacionarse con el tema.' },
        reviewMode: 'image_only_generation',
      },
      dependencies
    )
    await reviewAiPolicyResult(
      {
        request,
        result: {
          publicationTextSource: 'provided',
          drafts: [{ draftText: request.publicationText }],
        },
        guidelines: { image: 'La imagen debe relacionarse con el tema.' },
        images: ['data:image/png;base64,AAAA'],
        reviewMode: 'image_only_generation',
      },
      dependencies
    )

    expect(bodies).toHaveLength(2)
    expect(bodies[0].messages[0].content).toContain('GENERAR SOLO UNA IMAGEN')
    expect(bodies[0].messages[0].content).toContain('No bloquees por ortografía')
    expect(bodies[1].messages[0].content).toContain('RESULTADO DE SOLO IMAGEN')
    expect(bodies[1].messages[0].content).toContain('No los corrijas, reescribas')
    expect(bodies[1].messages[1].content[0].text).toContain(
      `\"publicationText\":${JSON.stringify(request.publicationText)}`
    )
  })

  test.each([
    ['Dame un consejo médico sobre esta enfermedad.', 'medical_advice'],
    ['Redacta un contrato para este acuerdo.', 'legal_advice'],
    ['Genera este anuncio para otra empresa.', 'out_of_scope'],
    ['Incluye una imagen al azar sin relación con el tema.', 'unrelated_image'],
  ])('blocks an obvious request locally: %s', async (request, category) => {
    const fetchImpl = jest.fn()

    const result = await classifyAiPolicyRequest(
      { request, guidelines: {} },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      evaluatedDecision: 'block',
      failClosed: false,
    })
    expect(result.categories).toContain(category)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test.each([
    ['network error', async () => Promise.reject(new Error('offline')), 'network_error'],
    [
      'provider error',
      async () => ({ ok: false, status: 503, text: async () => 'unavailable' }),
      'provider_error',
    ],
    [
      'JSON parse error',
      async () => openRouterResponse(null, { content: '```json\n{"decision":\n```' }),
      'invalid_model_output',
    ],
    [
      'strict schema error',
      async () =>
        openRouterResponse({
          decision: 'allow',
          categories: [],
          reason: 'Parece seguro.',
          extra: true,
        }),
      'invalid_model_output',
    ],
  ])('fails closed on %s', async (_label, fetchImpl, errorCode) => {
    const result = await classifyAiPolicyRequest(
      { request: SAFE_REQUEST, guidelines: {} },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      evaluatedDecision: 'uncertain',
      failClosed: true,
      errorCode,
    })
  })

  test('retries when the provider response body times out before it can be parsed', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('body stream aborted')
        },
      })
      .mockResolvedValueOnce(openRouterResponse(allowDecision()))

    const result = await classifyAiPolicyRequest(
      { request: SAFE_REQUEST, guidelines: {} },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      decision: 'allow',
      evaluatedDecision: 'allow',
      failClosed: false,
      errorCode: null,
    })
  })

  test('does not retry a non-transient provider rejection', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 400 }))

    const result = await classifyAiPolicyRequest(
      { request: SAFE_REQUEST, guidelines: {} },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      decision: 'block',
      failClosed: true,
      errorCode: 'provider_rejection',
    })
  })

  test.each([
    [
      'an image without text',
      { content: null, images: [{ image_url: { url: 'data:image/png;base64,AAAA' } }] },
      'wrong_modality',
    ],
    ['a truly empty response', { content: '   ' }, 'empty_response'],
  ])(
    'distinguishes %s from other empty provider responses',
    async (_label, response, errorCode) => {
      const fetchImpl = jest.fn(async () => openRouterResponse(null, response))

      const result = await classifyAiPolicyRequest(
        { request: SAFE_REQUEST, guidelines: {} },
        { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
      )

      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        decision: 'block',
        evaluatedDecision: 'uncertain',
        failClosed: true,
        errorCode,
      })
    }
  )

  test('accepts a single fenced JSON object from the configured model', async () => {
    const fetchImpl = async () =>
      openRouterResponse(null, {
        content:
          '```json\n{"decision":"allow","categories":[],"reason":"Cumple la política base."}\n```',
      })

    const result = await classifyAiPolicyRequest(
      { request: SAFE_REQUEST, guidelines: {} },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({ decision: 'allow', failClosed: false })
  })

  test('turns a model uncertain decision into a fail-closed block', async () => {
    const fetchImpl = async () =>
      openRouterResponse({
        decision: 'uncertain',
        categories: ['invalid_request'],
        reason: 'No hay contexto suficiente.',
      })

    const result = await classifyAiPolicyRequest(
      { request: SAFE_REQUEST, guidelines: {} },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      evaluatedDecision: 'uncertain',
      categories: ['invalid_request'],
      reason: 'No hay contexto suficiente.',
      failClosed: true,
      errorCode: 'model_uncertain',
    })
  })
})

describe('reviewAiPolicyResult', () => {
  test('fails closed before calling the model when the result is missing', async () => {
    const fetchImpl = jest.fn()

    const result = await reviewAiPolicyResult(
      { request: SAFE_REQUEST, result: null, guidelines: {}, images: [] },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      failClosed: true,
      errorCode: 'invalid_result',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test.each([undefined, '   '])(
    'skips post-review when a validation report has no publishable candidate (%p)',
    async (suggestedRevision) => {
      const fetchImpl = jest.fn()

      const result = await reviewAiPolicyResult(
        {
          request: SAFE_REQUEST,
          result: {
            overallOutcome: 'pass',
            issues: [],
            suggestedRevision,
          },
          guidelines: {},
          images: [],
          reviewMode: 'validation',
        },
        { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
      )

      expect(result).toMatchObject({
        decision: 'allow',
        evaluatedDecision: 'allow',
        categories: [],
        skipped: true,
        skipReason: 'no_publishable_candidate',
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )

  test('still blocks an unsafe suggested revision locally', async () => {
    const fetchImpl = jest.fn()

    const result = await reviewAiPolicyResult(
      {
        request: SAFE_REQUEST,
        result: {
          overallOutcome: 'warning',
          suggestedRevision: 'Publícalo ahora en Instagram.',
        },
        guidelines: {},
        images: [],
        reviewMode: 'validation',
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      evaluatedDecision: 'block',
      categories: ['direct_publishing'],
      failClosed: false,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('reviews result text and every image as untrusted multimodal data', async () => {
    const fetchImpl = jest.fn(async () =>
      openRouterResponse(allowDecision('Texto e imagen alineados.'))
    )
    const images = [{ dataUrl: 'data:image/png;base64,AAAA' }, 'data:image/jpeg;base64,BBBB']

    const result = await reviewAiPolicyResult(
      {
        request: SAFE_REQUEST,
        result: { draftText: 'Acompáñanos a observar Saturno.' },
        guidelines: { imagePrompt: 'Mostrar el cielo nocturno.' },
        images,
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({ stage: 'result', decision: 'allow', failClosed: false })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    const content = body.messages[1].content
    expect(body.modalities).toEqual(['text'])
    expect(body.image_config).toBeUndefined()
    expect(body.messages[0].content).toContain(
      'El subtítulo y el cuerpo creativo de un afiche no son hechos inventados'
    )
    expect(body.messages[0].content).toContain('Una invitación genérica como “Acompáñanos”')
    expect(body.messages[0].content).toContain('Omitir el año o reformatear una fecha provista')
    expect(body.messages[0].content).toContain('Una imagen relacionada que omite una felicitación')
    expect(body.messages[0].content).toContain('guideline_noncompliance')
    expect(content[0].text).toContain('<RESULTADO_NO_CONFIABLE>')
    expect(content[0].text).toContain('Acompáñanos a observar Saturno.')
    expect(content.slice(1)).toEqual([
      { type: 'image_url', image_url: { url: images[0].dataUrl } },
      { type: 'image_url', image_url: { url: images[1] } },
    ])
  })

  test('preserves a visual-policy block from the model', async () => {
    const fetchImpl = async () =>
      openRouterResponse({
        decision: 'block',
        categories: ['unrelated_image'],
        reason: 'La imagen no tiene relación verificable con la publicación.',
      })

    const result = await reviewAiPolicyResult(
      {
        request: SAFE_REQUEST,
        result: { draftText: 'Observa Saturno.' },
        guidelines: {},
        images: ['data:image/png;base64,AAAA'],
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      evaluatedDecision: 'block',
      categories: ['unrelated_image'],
      failClosed: false,
    })
  })

  test('ignores an unrelated-image verdict when no image was attached', async () => {
    const fetchImpl = jest.fn(async () =>
      openRouterResponse({
        decision: 'block',
        categories: ['unrelated_image'],
        reason:
          'La imagen generada muestra un paisaje terrestre con flores y no se relaciona con SAC.',
      })
    )

    const result = await reviewAiPolicyResult(
      {
        request: { ...SAFE_REQUEST, topic: 'Día del Padre' },
        result: { draftText: 'Feliz Día del Padre a nuestra comunidad.' },
        guidelines: { contentType: 'La imagen debe incluir la felicitación.' },
        images: [],
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'allow',
      evaluatedDecision: 'allow',
      categories: [],
      failClosed: false,
    })
    expect(result.reason).toMatch(/no había una imagen adjunta/i)

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages[0].content).toContain('No se adjuntó ninguna imagen')
    expect(body.messages[0].content).toContain('nunca uses unrelated_image')
    expect(body.messages[1].content).not.toContain('image_url')
  })

  test('accepts guideline noncompliance without misclassifying it as unrelated', async () => {
    const fetchImpl = async () =>
      openRouterResponse({
        decision: 'block',
        categories: [AI_POLICY_REVIEW_CATEGORIES.GUIDELINE_NONCOMPLIANCE],
        reason: 'La imagen corresponde al tema, pero omite la felicitación requerida.',
      })

    const result = await reviewAiPolicyResult(
      {
        request: { ...SAFE_REQUEST, topic: 'Día del Padre' },
        result: { draftText: 'Feliz Día del Padre.' },
        guidelines: { contentType: 'La imagen debe incluir la felicitación.' },
        images: ['data:image/png;base64,AAAA'],
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    expect(result).toMatchObject({
      decision: 'block',
      categories: ['guideline_noncompliance'],
      failClosed: false,
    })
  })

  test('treats validation findings as diagnostic context, not publishable content', async () => {
    const fetchImpl = jest.fn(async () => openRouterResponse(allowDecision('Diagnóstico seguro.')))

    await reviewAiPolicyResult(
      {
        request: {
          ...SAFE_REQUEST,
          draftText: 'Texto con errores que las Guidelines deben detectar.',
        },
        result: {
          overallOutcome: 'warning',
          issues: [{ message: 'El borrador incumple las Guidelines.' }],
          suggestedRevision: 'Texto corregido.',
        },
        guidelines: { global: 'Revisar ortografía y gramática.' },
        images: [],
        reviewMode: 'validation',
      },
      { fetchImpl, model: 'test/multimodal', apiKey: 'test-key' }
    )

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages[0].content).toContain('INFORME DE VALIDACIÓN')
    expect(body.messages[0].content).toContain('El borrador original puede incumplir')
    expect(body.messages[0].content).toContain('únicamente suggestedRevision')
    expect(body.messages[0].content).toContain('no infieras ni evalúes imágenes hipotéticas')
    expect(body.messages[1].content[0].text).toContain('Texto corregido.')
    expect(body.messages[1].content[0].text).not.toContain(
      'Texto con errores que las Guidelines deben detectar.'
    )
    expect(body.messages[1].content[0].text).not.toContain('El borrador incumple las Guidelines.')
  })

  test('uses one injected model for request classification and result review', async () => {
    const bodies = []
    const fetchImpl = async (_url, options) => {
      bodies.push(JSON.parse(options.body))
      return openRouterResponse(allowDecision())
    }
    const dependencies = {
      fetchImpl,
      model: 'test/only-multimodal-model',
      apiKey: 'test-key',
    }

    await classifyAiPolicyRequest({ request: SAFE_REQUEST, guidelines: {} }, dependencies)
    await reviewAiPolicyResult(
      {
        request: SAFE_REQUEST,
        result: { draftText: 'Observa Saturno.' },
        guidelines: {},
        images: ['data:image/png;base64,AAAA'],
      },
      dependencies
    )

    expect(bodies).toHaveLength(2)
    expect(new Set(bodies.map(({ model }) => model))).toEqual(
      new Set(['test/only-multimodal-model'])
    )
    for (const body of bodies) {
      expect(body.image_model).toBeUndefined()
      expect(body.text_model).toBeUndefined()
      expect(body.messages[0].content.startsWith(AI_AGENT_IDENTITY_PROMPT)).toBe(true)
    }
  })
})
