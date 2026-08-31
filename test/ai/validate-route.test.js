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

const { getActiveGuidelinesStrict, getDefaultGuidelines } = require('../../lib/ai-guidelines')
const { start } = require('workflow/api')
const {
  reserveAiRun,
  activateAiRunLease,
  releaseAiRunReservation,
} = require('../../lib/ai-run-lease-store')
const { POST } = require('../../app/api/admin/ai/validate/route')

const RUN_TOKEN = '22222222-2222-4222-8222-222222222222'

function jsonRequest(body, { runToken = RUN_TOKEN } = {}) {
  return {
    auth: {
      user: {
        id: 'session-user',
        email: 'USER@example.com',
      },
    },
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-type') return 'application/json'
        if (name.toLowerCase() === 'x-ai-run-token') return runToken
        return null
      },
    },
    json: jest.fn().mockResolvedValue(body),
  }
}

const image = {
  dataUrl: 'data:image/png;base64,AA==',
  mimeType: 'image/png',
  fileName: 'post.png',
  size: 1,
}

describe('POST /api/admin/ai/validate contract', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    getActiveGuidelinesStrict.mockResolvedValue(getDefaultGuidelines())
    start.mockResolvedValue({
      runId: 'run-validate-123',
      status: Promise.resolve('pending'),
    })
    reserveAiRun.mockResolvedValue({
      claimId: 'claim-validate-1',
      coordination: 's3',
      reused: false,
      status: 'starting',
    })
    activateAiRunLease.mockResolvedValue({
      claimId: 'claim-validate-1',
      runId: 'run-validate-123',
      mode: 'validate',
      status: 'pending',
      coordination: 's3',
      reused: false,
    })
    releaseAiRunReservation.mockResolvedValue(true)
  })

  test('converts a legacy request and pins its content type identity', async () => {
    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Mira el cielo con nosotros esta noche.',
        images: [image],
      })
    )

    expect(response.status).toBe(202)
    const input = start.mock.calls[0][1][0]
    expect(input).toMatchObject({
      userId: 'session-user',
      userEmail: 'user@example.com',
      platforms: ['facebook'],
      contentType: 'post_educativo',
      guidelineVersion: 'default-v1',
      contentTypeIdentity: {
        id: 'post_educativo',
        label: 'Post educativo',
        guidelineVersion: 'default-v1',
      },
      contentData: {
        topic: 'Mira el cielo con nosotros esta noche.',
      },
      runCoordination: {
        claimId: 'claim-validate-1',
        coordination: 's3',
      },
    })
  })

  test('normalizes draft line endings before starting the workflow', async () => {
    const response = await POST(
      jsonRequest({
        platforms: ['facebook'],
        contentType: 'post_educativo',
        draftText: 'Primera línea.\r\n\r\nSegunda línea.',
        images: [image],
      })
    )

    expect(response.status).toBe(202)
    expect(start.mock.calls[0][1][0].draftText).toBe('Primera línea.\n\nSegunda línea.')
  })

  test('returns the same validation run for an idempotent browser token', async () => {
    reserveAiRun.mockResolvedValueOnce({
      claimId: 'claim-existing',
      runId: 'run-existing',
      mode: 'validate',
      status: 'running',
      coordination: 's3',
      reused: true,
    })

    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador',
        images: [image],
      })
    )

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      runId: 'run-existing',
      mode: 'validate',
      recovered: true,
    })
    expect(start).not.toHaveBeenCalled()
  })

  test('blocks validation while generation is active without leaking runId', async () => {
    reserveAiRun.mockRejectedValueOnce(
      Object.assign(new Error('active'), {
        code: 'AI_RUN_ACTIVE',
        mode: 'generate',
        status: 'pending',
        coordination: 's3',
      })
    )

    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador',
        images: [image],
      })
    )

    expect(response.status).toBe(409)
    expect(response.body.active).toEqual({ mode: 'generate', status: 'pending' })
    expect(response.body.runId).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
  })

  test('starts one validation workflow for the complete configured package', async () => {
    const response = await POST(
      jsonRequest({
        platforms: ['x', 'instagram', 'facebook'],
        contentType: 'post_educativo',
        draftText: 'Un caption compartido.',
        images: [image],
      })
    )

    expect(response.status).toBe(202)
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][1][0]).toMatchObject({
      platform: 'facebook',
      platforms: ['facebook'],
      draftText: 'Un caption compartido.',
    })
  })

  test('returns a recoverable run when lease activation fails after start', async () => {
    activateAiRunLease.mockRejectedValueOnce(
      Object.assign(new Error('CAS busy'), { code: 'AI_RUN_COORDINATION_BUSY' })
    )

    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador',
        images: [image],
      })
    )

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      runId: 'run-validate-123',
      mode: 'validate',
      recovered: true,
      coordination: 's3',
    })
    expect(releaseAiRunReservation).not.toHaveBeenCalled()
  })

  test('fails closed when the active Guidelines version cannot be pinned', async () => {
    getActiveGuidelinesStrict.mockRejectedValueOnce(new Error('S3 unavailable'))

    const response = await POST(
      jsonRequest({ platform: 'facebook', contentType: 'post_educativo', draftText: 'Borrador' })
    )

    expect(response.status).toBe(503)
    expect(response.body.error).toBe('Guías no disponibles')
    expect(start).not.toHaveBeenCalled()
  })

  test('accepts explicit contentData and rejects fields outside the active definition', async () => {
    const valid = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador',
        images: [image],
        contentData: {
          topic: 'Astronomía para principiantes',
        },
      })
    )
    expect(valid.status).toBe(202)

    const invalid = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador',
        contentData: {
          intent: 'Revisar claridad',
          topic: 'Astronomía para principiantes',
          private_notes: 'No enviar',
        },
      })
    )
    expect(invalid.status).toBe(400)
    expect(invalid.body.details).toContain('private_notes')
  })

  test('rejects unknown and archived content types before start', async () => {
    const unknown = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'unknown_type',
        draftText: 'Borrador',
      })
    )
    expect(unknown.status).toBe(400)

    const archived = getDefaultGuidelines()
    archived.contentTypeCatalog = archived.contentTypeCatalog.map((entry) =>
      entry.id === 'post_educativo' ? { ...entry, status: 'archived' } : entry
    )
    getActiveGuidelinesStrict.mockResolvedValue(archived)
    const archivedResponse = await POST(
      jsonRequest({ platform: 'facebook', contentType: 'post_educativo', draftText: 'Borrador' })
    )

    expect(archivedResponse.status).toBe(400)
    expect(archivedResponse.body.error).toBe('Tipo de contenido archivado')
    expect(start).not.toHaveBeenCalled()
  })

  test('rejects a supported runtime platform removed from active Guidelines', async () => {
    const document = getDefaultGuidelines()
    delete document.platforms.facebook
    delete document.platformLabels.facebook
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(
      jsonRequest({ platform: 'facebook', contentType: 'post_educativo', draftText: 'Borrador' })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Plataforma no disponible')
    expect(start).not.toHaveBeenCalled()
  })

  test('enforces the active image policy for the selected platform', async () => {
    const document = getDefaultGuidelines()
    const definition = document.contentTypeCatalog.find(({ id }) => id === 'post_educativo')
    definition.visual = {
      mode: 'none',
      template: null,
      backgroundSources: [],
      sponsorAllowed: false,
      imagePolicyByPlatform: {
        x: 'prohibited',
        instagram: 'prohibited',
        facebook: 'prohibited',
      },
    }
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador para reel.',
        images: [
          {
            dataUrl: 'data:image/png;base64,AA==',
            mimeType: 'image/png',
            fileName: 'frame.png',
            size: 1,
          },
        ],
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Imagen no permitida')
    expect(start).not.toHaveBeenCalled()
  })

  test('treats a sponsor logo as an image under the selected platform policy', async () => {
    const document = getDefaultGuidelines()
    const definition = document.contentTypeCatalog.find(({ id }) => id === 'observation_night')
    definition.platforms = ['x']
    definition.visual.imagePolicyByPlatform.x = 'prohibited'
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(
      jsonRequest({
        platform: 'x',
        contentType: 'observation_night',
        draftText: 'Borrador.',
        contentData: {
          date: '2026-08-15',
          time: '19:30',
          location: 'Cabo Rojo',
          sponsor: {
            dataUrl: 'data:image/png;base64,aaaa',
            mimeType: 'image/png',
            fileName: 'sponsor.png',
          },
        },
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Imagen no permitida')
    expect(start).not.toHaveBeenCalled()
  })

  test.each([
    {
      name: 'remote URL instead of a bounded data URL',
      image: {
        dataUrl: 'https://provider.example/image.png',
        mimeType: 'image/png',
        fileName: 'image.png',
      },
    },
    {
      name: 'spoofed byte size',
      image: {
        dataUrl: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        fileName: 'image.png',
        size: 99,
      },
    },
  ])('rejects JSON images with $name', async ({ image }) => {
    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'post_educativo',
        draftText: 'Borrador.',
        images: [image],
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Imágenes inválidas')
    expect(start).not.toHaveBeenCalled()
  })
})
