import path from 'path'
import fs from 'fs'
import { renderToStream } from '@react-pdf/renderer'
import { getPhoto } from '../google-drive'
import { cropToSquare, generateQrDataUrl } from './generateIdCard'
import { generateFamilyIdCardDocument } from './IdCardDocument'
import { generateVerifyToken } from './verifyToken'

/**
 * Generate a printable PDF Family Member ID card.
 *
 * @param {Object} primaryMember - Primary member from google-sheets
 * @param {string} familyDisplayName - Exact display name from familyMembers list
 * @returns {Promise<ReadableStream>} PDF stream
 */
export async function generateFamilyIdCardPdf(primaryMember, familyDisplayName) {
  const trimmedName = (familyDisplayName || '').trim()
  if (!trimmedName) {
    throw new Error('Family member name is required')
  }

  const familyMembers = primaryMember.familyMembers || []
  if (!familyMembers.includes(trimmedName)) {
    throw new Error(`Family member not found in list: ${trimmedName}`)
  }

  const photoFileId = primaryMember.familyMemberPhotos?.[trimmedName]
  if (!photoFileId) {
    throw new Error(`Family member photo required: ${trimmedName}`)
  }

  const token = generateVerifyToken(primaryMember.email)
  const verifyUrl = `https://sociedadastronomia.com/verify/${token}`

  const [qrDataUrl, photoData] = await Promise.all([
    generateQrDataUrl(verifyUrl),
    getPhoto(photoFileId),
  ])

  if (!photoData) {
    throw new Error(`Family member photo not found in Drive: ${trimmedName}`)
  }

  const photoBase64 = await cropToSquare(photoData.buffer, photoData.mimeType)

  const logoFilePath = path.join(process.cwd(), 'public/static/images/sac-white-logo.png')
  const logoBase64 = `data:image/png;base64,${fs.readFileSync(logoFilePath).toString('base64')}`

  const elementFilePath = path.join(process.cwd(), 'public/static/images/sac-id-element.png')
  const elementPath = `data:image/png;base64,${fs.readFileSync(elementFilePath).toString('base64')}`

  const doc = generateFamilyIdCardDocument({
    primaryMember,
    familyDisplayName: trimmedName,
    photoBase64,
    qrDataUrl,
    logoPath: logoBase64,
    elementPath,
  })

  return renderToStream(doc)
}
