/**
 * @jest-environment node
 */

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

jest.mock('../../lib/ai-run-lease-store', () => ({
  reserveAiRun: jest.fn(),
  activateAiRunLease: jest.fn(),
  releaseAiRunReservation: jest.fn(),
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
const { checkWorkflowStartRateLimit } = require('../../lib/ai-rate-limit')
const {
  reserveAiRun,
  activateAiRunLease,
  releaseAiRunReservation,
} = require('../../lib/ai-run-lease-store')
const { getActiveGuidelinesStrict, getDefaultGuidelines } = require('../../lib/ai-guidelines')
const { POST } = require('../../app/api/admin/ai/generate/route')

const RUN_TOKEN = '11111111-1111-4111-8111-111111111111'

function requestWithBody(body, { runToken = RUN_TOKEN } = {}) {
  return {
    auth: {
      user: {
        id: 'session-user',
        email: 'USER@example.com',
      },
    },
    headers: {
      get: (name) => (name.toLowerCase() === 'x-ai-run-token' ? runToken : null),
    },
    json: jest.fn().mockResolvedValue(body),
  }
}

const validEventBody = {
  intent: 'Invitar al público',
  topic: 'Noche de Observación',
  platforms: ['instagram'],
  contentType: 'observation_night',
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
    checkWorkflowStartRateLimit.mockReturnValue(null)
    getActiveGuidelinesStrict.mockResolvedValue(getDefaultGuidelines())
    start.mockResolvedValue({
      runId: 'run-123',
      status: Promise.resolve('pending'),
    })
    reserveAiRun.mockResolvedValue({
      claimId: 'claim-generate-1',
      coordination: 's3',
      reused: false,
      status: 'starting',
    })
    activateAiRunLease.mockResolvedValue({
      claimId: 'claim-generate-1',
      runId: 'run-123',
      mode: 'generate',
      status: 'pending',
      coordination: 's3',
      reused: false,
    })
    releaseAiRunReservation.mockResolvedValue(true)
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
    expect(startedInput.generationMode).toBe('text_and_image')
    expect(startedInput.guidelineVersion).toBe('default-v1')
    expect(startedInput.runCoordination).toEqual({
      claimId: 'claim-generate-1',
      coordination: 's3',
    })
    expect(startedInput.contentTypeIdentity).toEqual({
      id: 'observation_night',
      label: 'Noche de Observación',
      guidelineVersion: 'default-v1',
    })
    expect(startedInput.contentData).toMatchObject({
      date: '2026-08-15',
      time: '19:30',
      location: 'Cabo Rojo',
      cta: 'Confirma tu asistencia',
    })
  })

  test('starts image_only with publicationText preserved exactly', async () => {
    const publicationText = '  Caption existente\r\n\r\n#Conservar  '
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        generationMode: 'image_only',
        publicationText,
      })
    )

    expect(response.status).toBe(202)
    const startedInput = start.mock.calls[0][1][0]
    expect(startedInput.generationMode).toBe('image_only')
    expect(startedInput.publicationText).toBe(publicationText)
  })

  test('ignores an irrelevant publicationText in the default text_and_image mode', async () => {
    const response = await POST(
      requestWithBody({ ...validEventBody, publicationText: 'No usar como entrada.' })
    )

    expect(response.status).toBe(202)
    const startedInput = start.mock.calls[0][1][0]
    expect(startedInput.generationMode).toBe('text_and_image')
    expect(startedInput.publicationText).toBeUndefined()
  })

  test('rejects image_only without publicationText before start', async () => {
    const response = await POST(
      requestWithBody({ ...validEventBody, generationMode: 'image_only' })
    )

    expect(response.status).toBe(400)
    expect(response.body.details).toContain('publicationText')
    expect(start).not.toHaveBeenCalled()
  })

  test('rejects image_only when Guidelines prohibit images', async () => {
    const document = getDefaultGuidelines()
    document.contentTypeCatalog = document.contentTypeCatalog.map((entry) =>
      entry.id === 'post_educativo'
        ? {
            ...entry,
            visual: {
              mode: 'none',
              template: null,
              backgroundSources: [],
              sponsorAllowed: false,
              imagePolicyByPlatform: { facebook: 'prohibited' },
            },
          }
        : entry
    )
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(
      requestWithBody({
        contentType: 'post_educativo',
        topic: 'Saturno',
        tone: 'Amigable',
        generationMode: 'image_only',
        publicationText: 'Caption existente.',
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Imagen no permitida')
    expect(start).not.toHaveBeenCalled()
  })

  test('returns an existing run idempotently for the same browser token', async () => {
    reserveAiRun.mockResolvedValueOnce({
      claimId: 'claim-existing',
      runId: 'run-existing',
      mode: 'generate',
      status: 'running',
      coordination: 's3',
      reused: true,
    })

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      runId: 'run-existing',
      mode: 'generate',
      recovered: true,
    })
    expect(start).not.toHaveBeenCalled()
    expect(checkWorkflowStartRateLimit).not.toHaveBeenCalled()
  })

  test('releases a new reservation when the actual workflow start is rate limited', async () => {
    checkWorkflowStartRateLimit.mockReturnValueOnce({
      status: 429,
      body: { error: 'Demasiadas solicitudes' },
    })

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(429)
    expect(releaseAiRunReservation).toHaveBeenCalledWith({
      userId: 'session-user',
      claimId: 'claim-generate-1',
      coordination: 's3',
    })
    expect(start).not.toHaveBeenCalled()
  })

  test('blocks a second mode without exposing the active run id', async () => {
    reserveAiRun.mockRejectedValueOnce(
      Object.assign(new Error('active'), {
        code: 'AI_RUN_ACTIVE',
        mode: 'validate',
        status: 'running',
        coordination: 's3',
      })
    )

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      code: 'AI_RUN_ACTIVE',
      active: { mode: 'validate', status: 'running' },
    })
    expect(response.body.runId).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
  })

  test('requires a browser run token before reserving a run', async () => {
    reserveAiRun.mockRejectedValueOnce(
      Object.assign(new Error('invalid token'), { code: 'INVALID_RUN_TOKEN' })
    )

    const response = await POST(requestWithBody(validEventBody, { runToken: null }))

    expect(response.status).toBe(400)
    expect(start).not.toHaveBeenCalled()
  })

  test('returns a recoverable run when lease activation fails after start', async () => {
    activateAiRunLease.mockRejectedValueOnce(
      Object.assign(new Error('CAS busy'), { code: 'AI_RUN_COORDINATION_BUSY' })
    )

    const response = await POST(requestWithBody(validEventBody))

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      runId: 'run-123',
      mode: 'generate',
      recovered: true,
      coordination: 's3',
    })
    expect(releaseAiRunReservation).not.toHaveBeenCalled()
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

  test('passes the selected event template presentation to the workflow', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        templatePresentation: 'pills',
      })
    )

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0].templatePresentation).toBe('pills')
  })

  test.each([
    ['invalid explicit background mode', { backgroundMode: 'custom' }],
    ['invalid template presentation', { templatePresentation: 'pill' }],
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

  test('requires date, time and location before start', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        eventDetails: {
          name: 'Noche de Observación',
          time: '19:30',
          location: 'Cabo Rojo',
        },
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.details).toContain('date')
    expect(start).not.toHaveBeenCalled()
  })

  test('rejects unknown and archived content types before start', async () => {
    const unknownResponse = await POST(
      requestWithBody({ ...validEventBody, contentType: 'unknown_type' })
    )
    expect(unknownResponse.status).toBe(400)

    const archived = getDefaultGuidelines()
    archived.contentTypeCatalog = archived.contentTypeCatalog.map((entry) =>
      entry.id === 'observation_night' ? { ...entry, status: 'archived' } : entry
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

  test('starts a post_educativo on its Guidelines platforms without inventing a prohibited-only image path', async () => {
    const response = await POST(
      requestWithBody({
        platforms: ['facebook'],
        contentType: 'post_educativo',
        intent: 'Educar a la comunidad',
        topic: 'El cielo de agosto',
      })
    )

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0]).toMatchObject({
      platforms: ['facebook'],
      contentType: 'post_educativo',
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
