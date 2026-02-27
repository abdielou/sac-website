// lib/google-drive.js
import { JWT } from 'google-auth-library'

/**
 * Create authenticated JWT for Google Drive API with drive.file scope.
 * Separate from spreadsheet auth (which uses spreadsheets scope).
 */
function createDriveAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

/**
 * Get an access token for Drive API calls
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  const auth = createDriveAuth()
  const { token } = await auth.getAccessToken()
  return token
}

/**
 * Search for a file by name in a specific Drive folder
 * @param {string} fileName - File name to search for
 * @param {string} folderId - Drive folder ID
 * @param {string} token - Access token
 * @returns {Promise<{id: string, name: string}|null>} File metadata or null
 */
async function findFileInFolder(fileName, folderId, token) {
  const query = encodeURIComponent(
    `name='${fileName}' and '${folderId}' in parents and trashed=false`
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) {
    console.error('Drive search failed:', res.status, await res.text())
    return null
  }

  const data = await res.json()
  return data.files?.[0] || null
}

/**
 * Rename a file in Google Drive
 * @param {string} fileId - Drive file ID
 * @param {string} newName - New file name
 * @returns {Promise<{id: string, name: string}>}
 */
export async function renameFile(fileId, newName) {
  const token = await getAccessToken()

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    }
  )

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Drive rename failed (${res.status}): ${errorText}`)
  }

  return res.json()
}

/**
 * Upload a profile photo to Google Drive.
 * If a file with the same name exists, renames the old one as a backup before uploading.
 *
 * @param {string} email - Member email (used as file name)
 * @param {Buffer} imageBuffer - Image binary data
 * @param {string} mimeType - Image MIME type (e.g. 'image/jpeg')
 * @returns {Promise<string>} New file's Drive ID
 */
export async function uploadPhoto(email, imageBuffer, mimeType) {
  const token = await getAccessToken()
  const folderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID

  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID is not configured')
  }

  const fileName = `${email}.jpg`

  // Check if file with same name exists; if so, rename as backup
  const existing = await findFileInFolder(fileName, folderId, token)
  if (existing) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupName = `${email}_backup_${timestamp}.jpg`
    await renameFile(existing.id, backupName)
  }

  // Build multipart upload body using Buffer.concat for binary safety
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
  })

  const boundary = '---drive-upload-boundary-' + Date.now()
  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ]

  const bodyBuffer = Buffer.concat([
    Buffer.from(bodyParts[0]),
    Buffer.from(bodyParts[1]),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBuffer,
    }
  )

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Drive upload failed (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  return data.id
}

/**
 * Fetch a photo from Google Drive by file ID
 *
 * @param {string} fileId - Drive file ID
 * @returns {Promise<{buffer: Buffer, mimeType: string}|null>} Photo data or null if not found
 */
export async function getPhoto(fileId) {
  const token = await getAccessToken()

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 404) {
    return null
  }

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Drive download failed (${res.status}): ${errorText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const mimeType = res.headers.get('content-type') || 'image/jpeg'

  return { buffer, mimeType }
}
