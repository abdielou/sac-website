/**
 * Lists all files in the Google Drive photos folder, matches them to members
 * by SAC email (filename = email.ext), and writes the Drive file ID to the
 * photoFileId column in the CLEAN sheet.
 *
 * Run: node scripts/sync-drive-photos-to-sheet.mjs
 */
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read .env
const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  env[key] = val
}

const ROOT_FOLDER_ID = env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID
const SHEET_ID = env.GOOGLE_SHEET_ID

// Photos are uploaded to the 'uploads' subfolder inside the root
const UPLOADS_FOLDER_ID = '1s6-zUdKZdC6nlHSHB0tlCJj1CVzfPhZj'
const FOLDER_ID = UPLOADS_FOLDER_ID

// --- Drive auth ---
const driveAuth = new JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const { token: driveToken } = await driveAuth.getAccessToken()

// --- List all files in the photos folder ---
console.log(`Listing files in Drive folder ${FOLDER_ID}...`)
let allFiles = []
let pageToken = null
do {
  const query = encodeURIComponent(`'${FOLDER_ID}' in parents and trashed=false`)
  const pageParam = pageToken ? `&pageToken=${pageToken}` : ''
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=nextPageToken,files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageParam}`,
    { headers: { Authorization: `Bearer ${driveToken}` } }
  )
  if (!res.ok) {
    console.error('Drive list failed:', res.status, await res.text())
    process.exit(1)
  }
  const data = await res.json()
  allFiles = allFiles.concat(data.files || [])
  pageToken = data.nextPageToken || null
} while (pageToken)

console.log(`Found ${allFiles.length} files in Drive folder`)

// Build email → file ID map (strip extension from filename)
const emailToFileId = {}
for (const file of allFiles) {
  const email = file.name.replace(/\.(jpeg|jpg|png|webp)$/i, '').toLowerCase()
  if (email.includes('@')) {
    emailToFileId[email] = file.id
  }
}
console.log(`Mapped ${Object.keys(emailToFileId).length} email→fileId entries`)

// --- Connect to spreadsheet ---
const sheetsAuth = new JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const doc = new GoogleSpreadsheet(SHEET_ID, sheetsAuth)
await doc.loadInfo()
const sheet = doc.sheetsByTitle['CLEAN']
if (!sheet) throw new Error('CLEAN sheet not found')

// Ensure photoFileId column exists
await sheet.loadHeaderRow()
const headers = sheet.headerValues
if (!headers.includes('photoFileId')) {
  await sheet.setHeaderRow([...headers, 'photoFileId'])
  await sheet.loadHeaderRow()
}

const rows = await sheet.getRows()
console.log(`Loaded ${rows.length} rows from CLEAN sheet`)

let updated = 0
let skipped = 0
let notFound = 0

for (const row of rows) {
  const sacEmail = (row.get('sac_email') || row.get('SAC_Email') || '').trim().toLowerCase()
  if (!sacEmail) continue

  const fileId = emailToFileId[sacEmail]
  if (!fileId) {
    notFound++
    continue
  }

  const currentFileId = (row.get('photoFileId') || '').trim()
  if (currentFileId === fileId) {
    skipped++
    continue
  }

  row.set('photoFileId', fileId)
  await row.save()
  console.log(`  ✓ ${sacEmail} → ${fileId}`)
  updated++
}

console.log(`\nDone. Updated: ${updated}, Already set: ${skipped}, No Drive file: ${notFound}`)
