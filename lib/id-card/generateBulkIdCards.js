import path from 'path'
import fs from 'fs'
import { renderToStream } from '@react-pdf/renderer'
import { getPhoto } from '../google-drive'
import { generateQrDataUrl } from './generateIdCard'
import { BulkIdCardDocument } from './BulkIdCardDocument'

const BATCH_SIZE = 5

/**
 * Generate a multi-page PDF containing ID cards for all provided members.
 *
 * Photos are fetched in batches of 5 for concurrency control.
 * Uses renderToStream to avoid holding entire PDF in memory.
 *
 * @param {Array<Object>} members - Active members with photoFileId (pre-filtered)
 * @returns {Promise<ReadableStream>} PDF stream
 */
export async function generateBulkIdCardsPdf(members) {
  // Resolve logo path
  const logoPath = path.join(process.cwd(), 'public/static/images/sac-white-logo.png')

  // Determine year from first member's expiration or current year (for background)
  const currentYear = new Date().getUTCFullYear()

  // Check for year-specific background image
  const bgPath = path.join(process.cwd(), `public/static/images/id-bg-${currentYear}.png`)
  const backgroundPath = fs.existsSync(bgPath) ? bgPath : null

  // Build cards array with controlled concurrency
  const cards = []

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.all(
      batch.map(async (member) => {
        // Determine vigencia year from expiration date or current year
        let year
        if (member.expirationDate) {
          year = new Date(member.expirationDate).getUTCFullYear()
        } else {
          year = currentYear
        }

        // Build verification URL
        const verifyUrl = `https://sociedadastronomia.com/verify/${encodeURIComponent(member.email)}`

        // Fetch photo and generate QR in parallel within this batch item
        const [qrDataUrl, photoData] = await Promise.all([
          generateQrDataUrl(verifyUrl),
          getPhoto(member.photoFileId),
        ])

        // Convert photo buffer to base64 data URL
        let photoBase64 = null
        if (photoData) {
          photoBase64 = `data:${photoData.mimeType};base64,${photoData.buffer.toString('base64')}`
        }

        return { member, photoBase64, qrDataUrl, year }
      })
    )

    cards.push(...batchResults)
  }

  // Render multi-page document to stream
  const doc = BulkIdCardDocument({ cards, logoPath, backgroundPath })
  const stream = await renderToStream(doc)
  return stream
}
