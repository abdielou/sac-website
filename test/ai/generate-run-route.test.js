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

jest.mock('workflow/runtime', () => ({
  getWorld: jest.fn(),
}))

jest.mock('workflow/api', () => ({
  getRun: jest.fn(),
}))

jest.mock('workflow/observability', () => ({
  hydrateResourceIO: jest.fn(),
  observabilityRevivers: {},
}))

jest.mock('../../lib/social-template/renderSocialTemplateImage', () => ({
  renderSocialTemplateImage: jest.fn(),
}))

jest.mock('../../lib/ai-run-lease-store', () => ({
  syncAiRunLeaseFromStatus: jest.fn(async () => null),
}))

jest.mock('../../lib/run-history-store', () => ({
  readAiRunFailure: jest.fn(async () => null),
}))

const sharp = require('sharp')
const { getWorld } = require('workflow/runtime')
const { getRun } = require('workflow/api')
const { hydrateResourceIO } = require('workflow/observability')
const { syncAiRunLeaseFromStatus } = require('../../lib/ai-run-lease-store')
const { readAiRunFailure } = require('../../lib/run-history-store')
const { renderSocialTemplateImage } = require('../../lib/social-template/renderSocialTemplateImage')
const {
  GET,
  applyTemplateRendersToWorkflowResult,
} = require('../../app/api/admin/ai/runs/[runId]/route')

async function tinyPngDataUrl() {
  const buffer = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 20, g: 30, b: 80 },
    },
  })
    .png()
    .toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
}

async function tinyJpegDataUrl() {
  const buffer = await sharp({
    create: {
      width: 1080,
      height: 1440,
      channels: 3,
      background: { r: 20, g: 30, b: 80 },
    },
  })
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer()
  return `data:image/jpeg;base64,${buffer.toString('base64')}`
}

function baseDraft() {
  return {
    platform: 'instagram',
    contentType: 'event_promotion',
    draftText: 'Acompáñanos a observar el cielo.',
    assumptions: [],
    missingInformation: [],
  }
}

describe('generation run result asset contract', () => {
  let consoleErrorSpy

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not render an unreviewed legacy template and omits its internals', async () => {
    const pngDataUrl = await tinyPngDataUrl()

    const output = await applyTemplateRendersToWorkflowResult({
      result: {
        drafts: [baseDraft(), { ...baseDraft(), platform: 'facebook' }],
        recommendedNextStep: 'Validar',
        humanReviewRequired: true,
        templateRequest: {
          layout: 'event',
          textFields: { headline: 'Noche de Observación' },
        },
        templateAssets: {
          backgroundSource: { mode: 'stock', backgroundId: 'telescope-nebula' },
          sponsorLogo: {
            dataUrl: pngDataUrl,
            mimeType: 'image/png',
          },
        },
      },
    })

    expect(renderSocialTemplateImage).not.toHaveBeenCalled()
    expect(output.result.templateRequest).toBeUndefined()
    expect(output.result.templateAssets).toBeUndefined()
    expect(output.result.generatedImage).toBeUndefined()
    expect(output.result.drafts[0].missingInformation.join(' ')).toMatch(
      /revisión de política verificable/i
    )
    expect(output.result.drafts.every((draft) => draft.generatedImages === undefined)).toBe(true)
  })

  test('does not normalize or return an unreviewed legacy provider image', async () => {
    const pngDataUrl = await tinyPngDataUrl()
    const output = await applyTemplateRendersToWorkflowResult({
      result: {
        drafts: [baseDraft()],
        recommendedNextStep: 'Validar',
        humanReviewRequired: true,
        generatedImage: {
          assetId: 'generated-social-0',
          status: 'draft',
          mimeType: 'image/png',
          dataUrl: pngDataUrl,
          downloadFileName: 'sac-borrador-social.png',
        },
      },
    })

    expect(output.result.generatedImage).toBeUndefined()
    expect(output.result.drafts[0].missingInformation.join(' ')).toMatch(
      /revisión de política verificable/i
    )
  })

  test('soft-fails an invalid provider blob without returning it', async () => {
    const output = await applyTemplateRendersToWorkflowResult({
      result: {
        drafts: [baseDraft()],
        recommendedNextStep: 'Validar',
        humanReviewRequired: true,
        generatedImage: {
          assetId: 'generated-social-0',
          status: 'draft',
          mimeType: 'image/png',
          dataUrl: 'https://provider.example/image.png',
        },
      },
    })

    expect(output.result.generatedImage).toBeUndefined()
    expect(output.result.drafts[0].missingInformation.join(' ')).toContain(
      'revisión de política verificable'
    )
  })

  test('returns an already prepared and reviewed template image byte-for-byte', async () => {
    const jpegDataUrl = await tinyJpegDataUrl()
    const output = await applyTemplateRendersToWorkflowResult({
      result: {
        drafts: [baseDraft()],
        recommendedNextStep: 'Validar',
        humanReviewRequired: true,
        imagePlatforms: ['instagram'],
        generatedImage: {
          assetId: 'generated-social-0',
          status: 'draft',
          mimeType: 'image/jpeg',
          dataUrl: jpegDataUrl,
          downloadFileName: 'sac-borrador-social.jpg',
          preparedForDisplay: true,
        },
        templateRequest: {
          layout: 'event',
          textFields: { headline: 'Noche de Observación' },
        },
        templateAssets: {
          backgroundSource: { mode: 'stock', backgroundId: 'telescope-nebula' },
        },
      },
    })

    expect(renderSocialTemplateImage).not.toHaveBeenCalled()
    expect(output.result.generatedImage.dataUrl).toBe(jpegDataUrl)
    expect(output.result.generatedImage.preparedForDisplay).toBeUndefined()
    expect(output.result.imagePlatforms).toEqual(['instagram'])
  })
})

describe('GET /api/admin/ai/runs/[runId] lease synchronization', () => {
  function requestFor(email = 'user@example.com', id = 'session-user') {
    return { auth: { user: { id, email } } }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    getWorld.mockResolvedValue({
      runs: {
        get: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-08-07T10:00:00.000Z'),
          startedAt: new Date('2026-08-07T10:00:01.000Z'),
          updatedAt: new Date('2026-08-07T10:00:02.000Z'),
        }),
      },
    })
    hydrateResourceIO.mockReturnValue({
      input: { userId: 'session-user', userEmail: 'user@example.com' },
    })
  })

  test('renews the matching account lease for an active run', async () => {
    syncAiRunLeaseFromStatus.mockResolvedValueOnce({
      runId: 'wrun_active',
      status: 'running',
      mode: 'generate',
      coordination: 'local',
    })
    getRun.mockReturnValue({
      exists: Promise.resolve(true),
      status: Promise.resolve('running'),
    })

    const response = await GET(requestFor(), {
      params: Promise.resolve({ runId: 'wrun_active' }),
    })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('running')
    expect(response.body).toMatchObject({ mode: 'generate', coordination: 'local' })
    expect(syncAiRunLeaseFromStatus).toHaveBeenCalledWith({
      userId: 'session-user',
      runId: 'wrun_active',
      status: 'running',
    })
  })

  test('does not reveal or touch a run owned by another account', async () => {
    hydrateResourceIO.mockReturnValue({
      input: { userId: 'different-user', userEmail: 'other@example.com' },
    })

    const response = await GET(requestFor(), {
      params: Promise.resolve({ runId: 'wrun_private' }),
    })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'No encontrado' })
    expect(syncAiRunLeaseFromStatus).not.toHaveBeenCalled()
    expect(readAiRunFailure).not.toHaveBeenCalled()
  })

  test('returns a structured failure sidecar with the legacy error string', async () => {
    const failure = {
      schemaVersion: 1,
      code: 'policy_review_wrong_modality',
      stage: 'request_policy',
      retryable: true,
      message: 'La revisión automática respondió con una imagen cuando debía responder con texto.',
    }
    readAiRunFailure.mockResolvedValueOnce(failure)
    const run = {
      exists: Promise.resolve(true),
      status: Promise.resolve('failed'),
    }
    Object.defineProperty(run, 'returnValue', {
      get: () => Promise.reject(new Error('Mensaje compatible para clientes anteriores')),
    })
    getRun.mockReturnValue(run)

    const response = await GET(requestFor(), {
      params: Promise.resolve({ runId: 'wrun_wrong_modality' }),
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      runId: 'wrun_wrong_modality',
      status: 'failed',
      error: 'La revisión automática respondió con una imagen cuando debía responder con texto.',
      failure,
    })
    expect(readAiRunFailure).toHaveBeenCalledWith('wrun_wrong_modality')
  })

  test('builds a safe structured fallback for failed legacy runs', async () => {
    const run = {
      exists: Promise.resolve(true),
      status: Promise.resolve('failed'),
    }
    Object.defineProperty(run, 'returnValue', {
      get: () =>
        Promise.reject(
          new Error('Workflow run "wrun_legacy_failure" failed: Fallo histórico sin sidecar')
        ),
    })
    getRun.mockReturnValue(run)

    const response = await GET(requestFor(), {
      params: Promise.resolve({ runId: 'wrun_legacy_failure' }),
    })

    expect(response.body.error).toBe('Fallo histórico sin sidecar')
    expect(response.body.failure).toEqual({
      schemaVersion: 1,
      code: 'workflow_failed',
      stage: 'workflow',
      retryable: false,
      message: 'Fallo histórico sin sidecar',
    })
  })
})
