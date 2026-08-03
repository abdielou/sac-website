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

const sharp = require('sharp')
const { renderSocialTemplateImage } = require('../../lib/social-template/renderSocialTemplateImage')
const {
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
