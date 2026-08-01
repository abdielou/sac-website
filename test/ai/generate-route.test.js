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

jest.mock('workflow/api', () => ({
  start: jest.fn(),
}))

const { start } = require('workflow/api')
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

  test('normalizes and deduplicates platforms before start', async () => {
    const response = await POST(
      requestWithBody({
        ...validEventBody,
        platforms: [' Instagram ', 'instagram', ' FACEBOOK '],
      })
    )

    expect(response.status).toBe(202)
    const startedInput = start.mock.calls[0][1][0]
    expect(startedInput.platforms).toEqual(['instagram', 'facebook'])
    expect(startedInput.userId).toBe('session-user')
    expect(startedInput.userEmail).toBe('user@example.com')
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
    expect(response.body.details).toContain('nombre')
    expect(response.body.details).toContain('CTA')
    expect(start).not.toHaveBeenCalled()
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
