import path from 'path'
import fs from 'fs'
import { Jimp } from 'jimp'
import QRCode from 'qrcode'
import { renderToStream } from '@react-pdf/renderer'
import { getPhoto } from '../google-drive'
import { generateIdCardDocument } from './IdCardDocument'
import { generateVerifyToken } from './verifyToken'

/**
 * Center-crop a photo buffer to a square PNG.
 * Ensures react-pdf renders a perfect circle with borderRadius.
 * @param {Buffer} buffer - Original image buffer
 * @returns {Promise<string>} data:image/png;base64,... string
 */
export async function cropToSquare(inputBuffer, mimeType = 'image/png') {
  const raw = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer)
  try {
    const image = await Jimp.read(raw)
    const w = image.width
    const h = image.height
    const size = Math.min(w, h)
    image.crop({ x: Math.floor((w - size) / 2), y: Math.floor((h - size) / 2), w: size, h: size })
    const pngBuffer = await image.getBuffer('image/png')
    return `data:image/png;base64,${pngBuffer.toString('base64')}`
  } catch (err) {
    console.error('[cropToSquare] FAILED:', err.message)
    return `data:${mimeType};base64,${raw.toString('base64')}`
  }
}

/**
 * Generate QR code as base64 PNG data URL
 * @param {string} url - URL to encode in the QR code
 * @returns {Promise<string>} data:image/png;base64,... string
 */
export async function generateQrDataUrl(url) {
  return QRCode.toDataURL(url, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })
}

/**
 * Generate a printable PDF ID card for a member.
 *
 * Orchestrates: photo fetch, QR generation, PDF rendering.
 * All async operations complete before rendering starts (prevents race conditions).
 *
 * @param {Object} member - Member data from google-sheets (name, email, memberSince, photoFileId, expirationDate)
 * @returns {Promise<ReadableStream>} PDF stream
 */
export async function generateIdCardPdf(member) {
  // Determine vigencia year from expiration date or current year
  let year
  if (member.expirationDate) {
    year = new Date(member.expirationDate).getUTCFullYear()
  } else {
    year = new Date().getUTCFullYear()
  }

  // Build verification URL with opaque token (not email)
  const token = generateVerifyToken(member.email)
  const verifyUrl = `https://sociedadastronomia.com/verify/${token}`

  // Fetch all async data in parallel before rendering
  const [qrDataUrl, photoData] = await Promise.all([
    generateQrDataUrl(verifyUrl),
    member.photoFileId ? getPhoto(member.photoFileId) : Promise.resolve(null),
  ])

  // Crop photo to square and convert to base64 (ensures perfect circle in PDF)
  let photoBase64 = null
  if (photoData) {
    photoBase64 = await cropToSquare(photoData.buffer, photoData.mimeType)
  }

  // Read logo as base64 data URL (react-pdf handles data URLs reliably)
  const logoFilePath = path.join(process.cwd(), 'public/static/images/sac-white-logo.png')
  const logoBase64 = `data:image/png;base64,${fs.readFileSync(logoFilePath).toString('base64')}`

  // Check for year-specific background image
  const bgPath = path.join(process.cwd(), `public/static/images/id-bg-${year}.png`)
  const backgroundPath = fs.existsSync(bgPath)
    ? `data:image/png;base64,${fs.readFileSync(bgPath).toString('base64')}`
    : null

  // Build the PDF document (all data ready, no race conditions)
  const doc = generateIdCardDocument({
    member,
    photoBase64,
    qrDataUrl,
    year,
    logoPath: logoBase64,
    backgroundPath,
  })

  // Render to stream
  const stream = await renderToStream(doc)
  return stream
}
