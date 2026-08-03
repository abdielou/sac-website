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

const { getActiveGuidelinesStrict, getDefaultGuidelines } = require('../../lib/ai-guidelines')
const { start } = require('workflow/api')
const { POST } = require('../../app/api/admin/ai/validate/route')

function jsonRequest(body) {
  return {
    auth: {
      user: {
        id: 'session-user',
        email: 'USER@example.com',
      },
    },
    headers: { get: () => 'application/json' },
    json: jest.fn().mockResolvedValue(body),
  }
}

describe('POST /api/admin/ai/validate contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getActiveGuidelinesStrict.mockResolvedValue(getDefaultGuidelines())
    start.mockResolvedValue({
      runId: 'run-validate-123',
      status: Promise.resolve('pending'),
    })
  })

  test('converts a legacy request and pins its content type identity', async () => {
    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'caption',
        draftText: 'Mira el cielo con nosotros esta noche.',
      })
    )

    expect(response.status).toBe(202)
    const input = start.mock.calls[0][1][0]
    expect(input).toMatchObject({
      userId: 'session-user',
      userEmail: 'user@example.com',
      contentType: 'caption',
      guidelineVersion: 'mvp-default-v1',
      contentTypeIdentity: {
        id: 'caption',
        label: 'Caption',
        guidelineVersion: 'mvp-default-v1',
      },
      contentData: {
        intent: 'Validar borrador existente',
        topic: 'Mira el cielo con nosotros esta noche.',
      },
    })
  })

  test('fails closed when the active Guidelines version cannot be pinned', async () => {
    getActiveGuidelinesStrict.mockRejectedValueOnce(new Error('S3 unavailable'))

    const response = await POST(
      jsonRequest({ platform: 'facebook', contentType: 'caption', draftText: 'Borrador' })
    )

    expect(response.status).toBe(503)
    expect(response.body.error).toBe('Guías no disponibles')
    expect(start).not.toHaveBeenCalled()
  })

  test('accepts explicit contentData and rejects fields outside the active definition', async () => {
    const valid = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'caption',
        draftText: 'Borrador',
        contentData: {
          intent: 'Revisar claridad',
          topic: 'Astronomía para principiantes',
        },
      })
    )
    expect(valid.status).toBe(202)

    const invalid = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'caption',
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
      entry.id === 'caption' ? { ...entry, status: 'archived' } : entry
    )
    getActiveGuidelinesStrict.mockResolvedValue(archived)
    const archivedResponse = await POST(
      jsonRequest({ platform: 'facebook', contentType: 'caption', draftText: 'Borrador' })
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
      jsonRequest({ platform: 'facebook', contentType: 'caption', draftText: 'Borrador' })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Plataforma no disponible')
    expect(start).not.toHaveBeenCalled()
  })

  test('enforces the active image policy for the selected platform', async () => {
    const response = await POST(
      jsonRequest({
        platform: 'facebook',
        contentType: 'reel_caption',
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
    const definition = document.contentTypeCatalog.find(({ id }) => id === 'regular_post')
    definition.fields.push({
      key: 'sponsor',
      label: 'Auspiciador',
      help: '',
      placeholder: '',
      required: false,
    })
    definition.visual.template = 'event'
    definition.visual.sponsorAllowed = true
    getActiveGuidelinesStrict.mockResolvedValue(document)

    const response = await POST(
      jsonRequest({
        platform: 'x',
        contentType: 'regular_post',
        draftText: 'Borrador.',
        contentData: {
          intent: 'Validar',
          topic: 'Saturno',
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
        contentType: 'caption',
        draftText: 'Borrador.',
        images: [image],
      })
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Imágenes inválidas')
    expect(start).not.toHaveBeenCalled()
  })
})
