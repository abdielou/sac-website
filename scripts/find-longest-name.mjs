/**
 * Find the member with the longest name (firstLine + lastLine as rendered on the ID card).
 * Run with: node scripts/find-longest-name.mjs
 */
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
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
const sheet = doc.sheetsByTitle['CLEAN'] || doc.sheetsByTitle['MEMBERS'] || doc.sheetsByIndex[0]
const rows = await sheet.getRows({ limit: 5000 })
console.log(`Loaded ${rows.length} rows from ${sheet.title}`)

const members = []
for (const row of rows) {
  const firstName = (row.get('Nombre') || '').trim()
  const lastName = (row.get('Apellidos') || '').trim()
  if (!firstName && !lastName) continue

  // Mirror card rendering: firstLine = firstName (+ middleName), lastLine = apellido1 + apellido2
  // Sheet has no middleName; split lastName on whitespace/hyphen like google-sheets.js does.
  const lastParts = lastName.split(/[\s-]/)
  const firstLine = firstName
  const lastLine = [lastParts[0], lastParts.slice(1).join(' ')].filter(Boolean).join(' ')

  members.push({
    firstName,
    lastName,
    firstLine,
    lastLine,
    firstLen: firstLine.length,
    lastLen: lastLine.length,
    totalLen: firstLine.length + lastLine.length,
    maxLineLen: Math.max(firstLine.length, lastLine.length),
  })
}

function topN(arr, key, n = 5) {
  return [...arr].sort((a, b) => b[key] - a[key]).slice(0, n)
}

console.log('\n=== Top 5 by longest single line (firstLine OR lastLine) ===')
for (const m of topN(members, 'maxLineLen')) {
  console.log(
    `[${m.maxLineLen} chars]  firstLine="${m.firstLine}" (${m.firstLen})  lastLine="${m.lastLine}" (${m.lastLen})`
  )
}

console.log('\n=== Top 5 by longest firstLine ===')
for (const m of topN(members, 'firstLen')) {
  console.log(`[${m.firstLen} chars]  "${m.firstLine}"`)
}

console.log('\n=== Top 5 by longest lastLine ===')
for (const m of topN(members, 'lastLen')) {
  console.log(`[${m.lastLen} chars]  "${m.lastLine}"`)
}
