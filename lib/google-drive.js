// lib/google-drive.js
import { JWT } from 'google-auth-library'
import { nameToPhotoSlug } from './family-members'

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
 * Find or create a subfolder inside a parent folder.
 * @param {string} folderName - Subfolder name
 * @param {string} parentId - Parent folder/drive ID
 * @param {string} token - Access token
 * @returns {Promise<string>} Subfolder ID
 */
async function getOrCreateSubfolder(folderName, parentId, token) {
  // Search for existing subfolder
  const query = encodeURIComponent(
    `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (searchRes.ok) {
    const data = await searchRes.json()
    if (data.files?.[0]) return data.files[0].id
  }

  // Create subfolder
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    }
  )

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Drive folder creation failed (${res.status}): ${errorText}`)
  }

  const folder = await res.json()
  return folder.id
}

// Cache the uploads folder ID so we only look it up once per process
let _uploadsFolderId = null

/**
 * Build a timestamped backup filename for a member photo.
 * @param {string} email
 * @returns {string}
 */
function backupFileName(email) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${email}_backup_${timestamp}.jpg`
}

/**
 * Rename an existing Drive photo to a backup name (never delete).
 * @param {string} email - Member email (used in backup filename when customName omitted)
 * @param {string} fileId - Drive file ID to preserve
 * @param {string} token - Access token
 * @param {string} [customBackupName] - Optional explicit backup filename
 */
async function backupPhotoById(email, fileId, token, customBackupName) {
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!metaRes.ok) {
    console.warn(`Could not read photo metadata for backup (${metaRes.status}): ${fileId}`)
    return
  }

  const meta = await metaRes.json()
  if (!meta.name || meta.name.includes('_backup_')) {
    return
  }

  await renameFile(fileId, customBackupName || backupFileName(email))
}

/**
 * Upload a profile photo to Google Drive.
 * Preserves the previous photo by renaming it as a backup (never deletes).
 *
 * @param {string} email - Member email (used as file name)
 * @param {Buffer} imageBuffer - Image binary data
 * @param {string} mimeType - Image MIME type (e.g. 'image/jpeg')
 * @param {Object} [options]
 * @param {string} [options.currentPhotoFileId] - Drive ID of the member's current photo (from Sheets)
 * @returns {Promise<string>} New file's Drive ID
 */
export async function uploadPhoto(email, imageBuffer, mimeType, options = {}) {
  const { currentPhotoFileId } = options
  const token = await getAccessToken()
  const rootFolderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID

  if (!rootFolderId) {
    throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID is not configured')
  }

  // Use "uploads" subfolder inside the configured root
  if (!_uploadsFolderId) {
    _uploadsFolderId = await getOrCreateSubfolder('uploads', rootFolderId, token)
  }
  const folderId = _uploadsFolderId

  const fileName = `${email}.jpg`

  // Backup the current photo referenced in Sheets (covers adjust/re-crop flows)
  if (currentPhotoFileId) {
    await backupPhotoById(email, currentPhotoFileId, token)
  }

  // Backup any canonical filename slot not already backed up above
  const existing = await findFileInFolder(fileName, folderId, token)
  if (existing && existing.id !== currentPhotoFileId) {
    await backupPhotoById(email, existing.id, token)
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
 * Build a timestamped backup filename for a family member photo.
 * @param {string} ownerEmail
 * @param {string} slug
 * @returns {string}
 */
function familyBackupFileName(ownerEmail, slug) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${ownerEmail}_family_${slug}_backup_${timestamp}.jpg`
}

/**
 * Upload a family member photo to Google Drive.
 * Preserves the previous photo by renaming it as a backup (never deletes).
 *
 * @param {string} ownerEmail - Primary member sheet email
 * @param {string} familyDisplayName - Exact display name from familyMembers list
 * @param {Buffer} imageBuffer - Image binary data
 * @param {string} mimeType - Image MIME type (e.g. 'image/jpeg')
 * @param {Object} [options]
 * @param {string} [options.currentPhotoFileId] - Existing Drive ID to backup
 * @returns {Promise<string>} New file's Drive ID
 */
export async function uploadFamilyPhoto(
  ownerEmail,
  familyDisplayName,
  imageBuffer,
  mimeType,
  options = {}
) {
  const { currentPhotoFileId } = options
  const token = await getAccessToken()
  const rootFolderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID

  if (!rootFolderId) {
    throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID is not configured')
  }

  if (!_uploadsFolderId) {
    _uploadsFolderId = await getOrCreateSubfolder('uploads', rootFolderId, token)
  }
  const folderId = _uploadsFolderId

  const slug = nameToPhotoSlug(familyDisplayName)
  const fileName = `${ownerEmail}_family_${slug}.jpg`
  const backupName = familyBackupFileName(ownerEmail, slug)

  if (currentPhotoFileId) {
    await backupPhotoById(ownerEmail, currentPhotoFileId, token, backupName)
  }

  const existing = await findFileInFolder(fileName, folderId, token)
  if (existing && existing.id !== currentPhotoFileId) {
    await backupPhotoById(ownerEmail, existing.id, token, backupName)
  }

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

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

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
