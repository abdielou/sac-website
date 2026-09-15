jest.mock('../../auth', () => ({
  auth: (handler) => handler,
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status || 200, body }),
  },
}))

jest.mock('../../lib/api-permissions', () => ({
  checkReadAccess: jest.fn(() => null),
}))

jest.mock('../../lib/ai-run-lease-store', () => ({
  recoverAiRun: jest.fn(),
}))

const { recoverAiRun } = require('../../lib/ai-run-lease-store')
const { POST } = require('../../app/api/admin/ai/runs/recover/route')

function requestWithToken(requestToken = '11111111-1111-4111-8111-111111111111') {
  return {
    auth: { user: { id: 'session-user', email: 'user@example.com' } },
    json: jest.fn().mockResolvedValue({ requestToken }),
  }
}

describe('POST /api/admin/ai/runs/recover', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns an attached run only for the matching browser token', async () => {
    recoverAiRun.mockResolvedValue({
      runId: 'wrun_recovered',
      mode: 'generate',
      status: 'running',
      coordination: 's3',
    })

    const response = await POST(requestWithToken())

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      runId: 'wrun_recovered',
      mode: 'generate',
      status: 'running',
      coordination: 's3',
    })
    expect(recoverAiRun).toHaveBeenCalledWith({
      userId: 'session-user',
      requestToken: '11111111-1111-4111-8111-111111111111',
    })
  })

  test('returns 202 while the matching request is still being attached', async () => {
    recoverAiRun.mockResolvedValue({
      runId: null,
      mode: 'validate',
      status: 'starting',
      coordination: 's3',
    })

    const response = await POST(requestWithToken())

    expect(response.status).toBe(202)
    expect(response.body.runId).toBeNull()
    expect(response.body.status).toBe('starting')
  })

  test('does not reveal an active run for a non-matching token', async () => {
    recoverAiRun.mockResolvedValue(null)

    const response = await POST(requestWithToken('22222222-2222-4222-8222-222222222222'))

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'No encontrado' })
  })

  test('rejects an invalid token without exposing coordination state', async () => {
    recoverAiRun.mockRejectedValue(
      Object.assign(new Error('invalid'), { code: 'INVALID_RUN_TOKEN' })
    )

    const response = await POST(requestWithToken('bad'))

    expect(response.status).toBe(400)
    expect(response.body.runId).toBeUndefined()
  })
})
