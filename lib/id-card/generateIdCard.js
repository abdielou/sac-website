import path from 'path'
import fs from 'fs'
import { Jimp } from 'jimp'
import QRCode from 'qrcode'
import { renderToStream } from '@react-pdf/renderer'
import { getPhoto } from '../google-drive'
import { generateIdCardDocument } from './IdCardDocument'
import { generateVerifyToken } from './verifyToken'
import { ID_CARD_PHOTO_MAX_PX } from './cardLayout'

/** JPEG quality for profile photos embedded in ID card PDFs */
const ID_CARD_PHOTO_JPEG_QUALITY = 85

/**
 * Center-crop a photo buffer to a square JPEG sized for the ID card layout.
 * Large originals (multi-megapixel phone photos) are downscaled so react-pdf
 * does not embed multi-megabyte base64 blobs and time out.
 * @param {Buffer} buffer - Original image buffer
 * @returns {Promise<string>} data:image/jpeg;base64,... string
 */
export async function cropToSquare(inputBuffer, mimeType = 'image/jpeg') {
  const raw = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer)
  try {
    const image = await Jimp.read(raw)
    const w = image.width
    const h = image.height
    const size = Math.min(w, h)
    image.crop({ x: Math.floor((w - size) / 2), y: Math.floor((h - size) / 2), w: size, h: size })

    if (image.width > ID_CARD_PHOTO_MAX_PX) {
      image.resize({ w: ID_CARD_PHOTO_MAX_PX, h: ID_CARD_PHOTO_MAX_PX })
    }

    const jpegBuffer = await image.getBuffer('image/jpeg', { quality: ID_CARD_PHOTO_JPEG_QUALITY })
    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
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
    width: 800, // 4x source resolution so the PDF prints at ~1000 DPI equivalent
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

  // Read orbital rings overlay as base64 data URL
  const elementFilePath = path.join(process.cwd(), 'public/static/images/sac-id-element.png')
  const elementPath = `data:image/png;base64,${fs.readFileSync(elementFilePath).toString('base64')}`

  // Build the PDF document (all data ready, no race conditions)
  const doc = generateIdCardDocument({
    member,
    photoBase64,
    qrDataUrl,
    logoPath: logoBase64,
    elementPath,
  })

  // Render to stream
  const stream = await renderToStream(doc)
  return stream
}
