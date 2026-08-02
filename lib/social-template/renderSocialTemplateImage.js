import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getBackgroundById } from './backgroundCatalog'
import { buildTemplateSvg } from './buildTemplateSvg'
import { getSocialCanvas } from './platformCanvas'
import { getTemplateFontFaceCss } from './templateFontAssets'
import { getTemplateLayout } from './templateLayouts'

const BACKGROUNDS_DIR = 'public/static/social-templates/backgrounds'
const JPEG_QUALITY = 90
const MAX_INPUT_PIXELS = 40_000_000
const SAFE_SHARP_INPUT_OPTIONS = {
  failOn: 'error',
  limitInputPixels: MAX_INPUT_PIXELS,
}

function resolveBackgroundFilePath(backgroundId) {
  const entry = getBackgroundById(backgroundId)
  if (!entry) {
    throw new Error(`Unknown stock background: ${backgroundId}`)
  }
  return path.join(process.cwd(), BACKGROUNDS_DIR, entry.fileName)
}

function resolveLogoBuffer(asset) {
  const logoPath =
    asset === 'short'
      ? path.join(process.cwd(), 'public/static/images/sac-white-short-logo.png')
      : path.join(process.cwd(), 'public/static/images/sac-white-logo.png')

  return fs.promises.readFile(logoPath)
}

/**
 * @param {string} dataUrl
 * @returns {Buffer}
 */
function bufferFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid image data URL')
  }
  return Buffer.from(match[2], 'base64')
}

/**
 * Resolve background image bytes from stock file or AI-generated data URL.
 * @param {{ mode: string, backgroundId?: string, dataUrl?: string }} backgroundSource
 * @returns {Promise<Buffer>}
 */
async function resolveBackgroundBuffer(backgroundSource) {
  if (backgroundSource?.mode === 'ai_generated') {
    if (!backgroundSource.dataUrl) {
      throw new Error('AI-generated background missing dataUrl')
    }
    return bufferFromDataUrl(backgroundSource.dataUrl)
  }

  if (backgroundSource?.mode === 'stock') {
    const filePath = resolveBackgroundFilePath(backgroundSource.backgroundId)
    return fs.promises.readFile(filePath)
  }

  throw new Error(`Unsupported background mode: ${backgroundSource?.mode}`)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resize a logo inside its maximum box, then position it using its actual output
 * dimensions. This keeps non-square marks anchored to the requested edge.
 *
 * @param {{
 *   input: string|Buffer,
 *   canvas: { width: number, height: number },
 *   tokens: object,
 *   align: 'left'|'right',
 * }} params
 * @returns {Promise<{ input: Buffer, top: number, left: number, width: number, height: number }>}
 */
async function prepareLogoComposite({ input, canvas, tokens, align }) {
  const maxWidth = Math.max(1, Math.round(canvas.width * tokens.maxWidthPct))
  const maxHeight = Math.max(1, Math.round(canvas.height * tokens.maxHeightPct))
  const { data, info } = await sharp(input, SAFE_SHARP_INPUT_OPTIONS)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true })

  const requestedLeft =
    align === 'right'
      ? canvas.width - canvas.width * tokens.xFromRightPct - info.width
      : canvas.width * tokens.xPct
  const requestedTop = canvas.height - canvas.height * tokens.yFromBottomPct - info.height

  return {
    input: data,
    left: Math.round(clamp(requestedLeft, 0, canvas.width - info.width)),
    top: Math.round(clamp(requestedTop, 0, canvas.height - info.height)),
    width: info.width,
    height: info.height,
  }
}

/**
 * Composite the canonical social template JPEG shared across platforms.
 *
 * @param {{
 *   templateRequest: {
 *     layout: string,
 *     backgroundSource: { mode: string, backgroundId?: string, dataUrl?: string },
 *     textFields: object,
 *     sponsorLogo?: { dataUrl: string, mimeType?: string },
 *   },
 *   platform?: string,
 * }} params
 * @returns {Promise<{ dataUrl: string, mimeType: string, width: number, height: number }>}
 */
export async function renderSocialTemplateImage({ templateRequest, platform: _platform }) {
  if (!templateRequest?.textFields) {
    throw new Error('templateRequest.textFields is required')
  }

  const canvas = getSocialCanvas()
  const layout = getTemplateLayout(templateRequest.layout, canvas)
  if (!layout) {
    throw new Error(`Unknown template layout: ${templateRequest.layout}`)
  }

  const hasSponsor = Boolean(templateRequest.sponsorLogo?.dataUrl)
  const backgroundBuffer = await resolveBackgroundBuffer(templateRequest.backgroundSource)
  const logoBuffer = await resolveLogoBuffer(layout.logo.asset)
  const sponsorInput = hasSponsor ? bufferFromDataUrl(templateRequest.sponsorLogo.dataUrl) : null

  const [resizedBackground, logoComposite, sponsorComposite, fontFaceCss] = await Promise.all([
    sharp(backgroundBuffer, SAFE_SHARP_INPUT_OPTIONS)
      .rotate()
      .resize({
        width: canvas.width,
        height: canvas.height,
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toBuffer(),
    prepareLogoComposite({
      input: logoBuffer,
      canvas,
      tokens: layout.logo,
      align: 'left',
    }),
    hasSponsor && layout.sponsor
      ? prepareLogoComposite({
          input: sponsorInput,
          canvas,
          tokens: layout.sponsor,
          align: 'right',
        })
      : null,
    getTemplateFontFaceCss(),
  ])

  const svg = buildTemplateSvg({
    layout,
    canvas,
    textFields: templateRequest.textFields,
    hasSponsor,
    fontFaceCss,
    logoPlacement: logoComposite,
    sponsorPlacement: sponsorComposite,
  })
  const overlayBuffer = await sharp(Buffer.from(svg), SAFE_SHARP_INPUT_OPTIONS).png().toBuffer()
  const composites = [
    { input: overlayBuffer, top: 0, left: 0 },
    { input: logoComposite.input, top: logoComposite.top, left: logoComposite.left },
  ]
  if (sponsorComposite) {
    composites.push({
      input: sponsorComposite.input,
      top: sponsorComposite.top,
      left: sponsorComposite.left,
    })
  }

  const composed = await sharp(resizedBackground)
    .composite(composites)
    .flatten({ background: '#0B081C' })
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer()

  return {
    dataUrl: `data:image/jpeg;base64,${composed.toString('base64')}`,
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
  }
}
