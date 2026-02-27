import path from 'path'
import fs from 'fs'
import QRCode from 'qrcode'
import { renderToStream } from '@react-pdf/renderer'
import { getPhoto } from '../google-drive'
import { generateIdCardDocument } from './IdCardDocument'

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

  // Build verification URL
  const verifyUrl = `https://sociedadastronomia.com/verify/${encodeURIComponent(member.email)}`

  // Fetch all async data in parallel before rendering
  const [qrDataUrl, photoData] = await Promise.all([
    generateQrDataUrl(verifyUrl),
    member.photoFileId ? getPhoto(member.photoFileId) : Promise.resolve(null),
  ])

  // Convert photo buffer to base64 data URL
  let photoBase64 = null
  if (photoData) {
    photoBase64 = `data:${photoData.mimeType};base64,${photoData.buffer.toString('base64')}`
  }

  // Resolve logo path (absolute file path for server-side @react-pdf/renderer)
  const logoPath = path.join(process.cwd(), 'public/static/images/sac-white-logo.png')

  // Check for year-specific background image
  const bgPath = path.join(process.cwd(), `public/static/images/id-bg-${year}.png`)
  const backgroundPath = fs.existsSync(bgPath) ? bgPath : null

  // Build the PDF document (all data ready, no race conditions)
  const doc = generateIdCardDocument({
    member,
    photoBase64,
    qrDataUrl,
    year,
    logoPath,
    backgroundPath,
  })

  // Render to stream
  const stream = await renderToStream(doc)
  return stream
}
