jest.mock('../../auth', () => ({
  auth: (handler) => handler,
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({
      status: init.status || 200,
      body,
      json: async () => body,
    }),
  },
}))

jest.mock('../../lib/api-permissions', () => ({
  checkPermission: jest.fn(() => null),
}))

jest.mock('../../lib/ai-rate-limit', () => ({
  checkWorkflowStartRateLimit: jest.fn(() => null),
}))

jest.mock('../../lib/ai-guidelines', () => {
  const actual = jest.requireActual('../../lib/ai-guidelines')
  return {
    ...actual,
    getActiveGuidelinesStrict: jest.fn(async () => actual.getDefaultGuidelines()),
  }
})

jest.mock('workflow/api', () => ({
  start: jest.fn(),
}))

const { start } = require('workflow/api')
const { getActiveGuidelinesStrict, getDefaultGuidelines } = require('../../lib/ai-guidelines')
const { POST } = require('../../app/api/admin/ai/generate/route')

function requestWithBody(body) {
  return {
    auth: {
      user: {
        id: 'session-user',
        email: 'USER@example.com',
      },
    },
    json: jest.fn().mockResolvedValue(body),
  }
}

const validEventBody = {
  intent: 'Invitar al público',
  topic: 'Noche de Observación',
  platforms: ['instagram'],
  contentType: 'event_promotion',
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

describe('POST /api/admin/ai/generate contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getActiveGuidelinesStrict.mockResolvedValue(getDefaultGuidelines())
    start.mockResolvedValue({
      runId: 'run-123',
      status: Promise.resolve('pending'),
    })
  })

  test('returns 400 for malformed JSON and does not start a workflow', async () => {
    const req = requestWithBody(null)
    req.json.mockRejectedValue(new SyntaxError('Unexpected token'))

    const response = await POST(req)

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('JSON inválido')
    expect(start).not.toHaveBeenCalled()
  })

  test('fails closed when the active Guidelines version cannot be pinned', async () => {
    getActiveGuidelinesStrict.mockRejectedValueOnce(new Error('S3 unavailable'))

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(503)
    expect(response.body.error).toBe('Guías no disponibles')
    expect(start).not.toHaveBeenCalled()
  })

  test('starts generation for all platforms in active Guidelines', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        platforms: [' Instagram ', 'instagram', ' FACEBOOK '],
      })
    )

    expect(response.status).toBe(202)
    const startedInput = start.mock.calls[0][1][0]
    expect(startedInput.platforms).toEqual(['x', 'instagram', 'facebook'])
    expect(startedInput.userId).toBe('session-user')
    expect(startedInput.userEmail).toBe('user@example.com')
    expect(startedInput.guidelineVersion).toBe('default-v1')
    expect(startedInput.contentTypeIdentity).toEqual({
      id: 'event_promotion',
      label: 'Promoción de evento',
      guidelineVersion: 'default-v1',
    })
    expect(startedInput.contentData).toMatchObject({
      event_name: 'Noche de Observación',
      date: '2026-08-15',
      time: '19:30',
      location: 'Cabo Rojo',
      cta: 'Confirma tu asistencia',
    })
  })

  test('starts observation_night without converting it to event_promotion', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        contentType: 'observation_night',
      })
    )

    expect(response.status).toBe(202)
    const startedInput = start.mock.calls[0][1][0]
    expect(startedInput.contentType).toBe('observation_night')
    expect(startedInput.eventDetails.name).toBe('Noche de Observación')
  })

  test('starts observation_night without a CTA', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        contentType: 'observation_night',
        cta: '',
      })
    )

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0].cta).toBeUndefined()
  })

  test.each([
    ['invalid explicit background mode', { backgroundMode: 'custom' }],
    ['unknown stock background', { backgroundId: 'unknown-background' }],
    [
      'incompatible template content type',
      {
        contentType: 'caption',
        eventDetails: undefined,
        cta: undefined,
      },
    ],
  ])('returns 400 for %s before start', async (_label, overrides) => {
    const response = await POST(requestWithBody({ ...validEventBody, ...overrides }))

    expect(response.status).toBe(400)
    expect(start).not.toHaveBeenCalled()
  })

  test('requires event name, date, time, location and CTA before start', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        cta: '',
        eventDetails: {
          date: '2026-08-15',
          time: '19:30',
          location: 'Cabo Rojo',
        },
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.details).toContain('event_name')
    expect(response.body.details).toContain('cta')
    expect(start).not.toHaveBeenCalled()
  })

  test('rejects unknown and archived content types before start', async () => {
    const unknownResponse = await POST(
      requestWithBody({ ...validEventBody, contentType: 'unknown_type' })
    )
    expect(unknownResponse.status).toBe(400)

    const archived = getDefaultGuidelines()
    archived.contentTypeCatalog = archived.contentTypeCatalog.map((entry) =>
      entry.id === 'event_promotion' ? { ...entry, status: 'archived' } : entry
    )
    getActiveGuidelinesStrict.mockResolvedValue(archived)
    const archivedResponse = await POST(requestWithBody(validEventBody))

    expect(archivedResponse.status).toBe(400)
    expect(archivedResponse.body.error).toBe('Tipo de contenido archivado')
    expect(start).not.toHaveBeenCalled()
  })

  test('starts generation with the remaining platforms when one is removed from Guidelines', async () => {
    const document = getDefaultGuidelines()
    delete document.platforms.instagram
    delete document.platformLabels.instagram
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0].platforms).toEqual(['x', 'facebook'])
  })

  test('rejects generation when active Guidelines have no platforms', async () => {
    const document = getDefaultGuidelines()
    document.platforms = {}
    document.platformLabels = {}
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Plataforma no disponible')
    expect(start).not.toHaveBeenCalled()
  })

  test('starts a custom active content type using its pinned definition', async () => {
    const document = getDefaultGuidelines()
    document.version = 'guidelines-v12'
    document.contentTypeCatalog.push({
      id: 'community_story',
      label: 'Historia de la comunidad',
      status: 'active',
      description: 'Historias breves de la comunidad de SAC.',
      fields: [
        { key: 'intent', label: 'Intención', required: true },
        { key: 'topic', label: 'Tema', required: true },
      ],
      titleSource: 'topic',
      validation: { rules: 'Verificar claridad.' },
      generation: { rules: 'Redactar sin inventar.' },
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
    })
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(
      requestWithBody({
        contentType: 'community_story',
        platforms: ['facebook'],
        intent: 'Compartir una historia',
        topic: 'Primera observación de una socia',
      })
    )

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0]).toMatchObject({
      contentType: 'community_story',
      guidelineVersion: 'guidelines-v12',
      contentData: {
        intent: 'Compartir una historia',
        topic: 'Primera observación de una socia',
      },
      contentTypeIdentity: {
        id: 'community_story',
        label: 'Historia de la comunidad',
        guidelineVersion: 'guidelines-v12',
      },
    })
  })

  test('starts a regular_post with active Guidelines platforms without inventing a prohibited-only image path', async () => {
    const response = await POST(
      requestWithBody({
        platforms: ['x'],
        contentType: 'regular_post',
        intent: 'Educar a la comunidad',
        topic: 'El cielo de agosto',
      })
    )

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0]).toMatchObject({
      platforms: ['x', 'instagram', 'facebook'],
      contentType: 'regular_post',
    })
  })

  test('rejects syntactically valid but corrupt sponsor image bytes', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        sponsorLogo: {
          dataUrl: 'data:image/png;base64,bm90LWltYWdl',
          mimeType: 'image/png',
          fileName: 'sponsor.png',
        },
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.details).toContain('corrupto')
    expect(start).not.toHaveBeenCalled()
  })

  test('starts generation for an explicit AI background with the shared model config', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        backgroundMode: 'ai_generated',
        backgroundId: undefined,
      })
    )

    expect(response.status).toBe(202)
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][1][0].backgroundMode).toBe('ai_generated')
  })
})
