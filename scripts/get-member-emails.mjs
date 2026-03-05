/**
 * Standalone script to get member name → SAC email mapping from Google Sheets.
 * Run with: node scripts/get-member-emails.mjs
 * Outputs: scripts/member-emails.json
 */
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read .env manually
const envPath = join(__dirname, '..', '.env')
const envContent = readFileSync(envPath, 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  env[key] = val
}

const auth = new JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID, auth)
await doc.loadInfo()
console.log(`Loaded sheet: ${doc.title}`)

// List all sheets
console.log('Available sheets:', Object.keys(doc.sheetsByTitle))

// Find MEMBERS sheet
const sheet = doc.sheetsByTitle['CLEAN'] || doc.sheetsByTitle['MEMBERS'] || doc.sheetsByIndex[0]
console.log(`Using sheet: ${sheet.title} (${sheet.rowCount} rows)`)

const rows = await sheet.getRows()
console.log(`Got ${rows.length} rows`)

const members = []
for (const row of rows) {
  const firstName = (row.get('Nombre') || row.get('First Name') || '').trim()
  const lastName = (row.get('Apellidos') || row.get('Last Name') || '').trim()
  const name = [firstName, lastName].filter(Boolean).join(' ')
  const sacEmail = (row.get('sac_email') || row.get('SAC_Email') || '').trim().toLowerCase()

  if (!name) continue

  members.push({ name, sacEmail: sacEmail || null })
}

console.log(`Found ${members.length} members, ${members.filter((m) => m.sacEmail).length} with SAC email`)

const outPath = join(__dirname, 'member-emails.json')
writeFileSync(outPath, JSON.stringify(members, null, 2), 'utf8')
console.log(`Written to ${outPath}`)
