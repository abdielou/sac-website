/**
 * Match Canva photo names to SAC member emails.
 * Input: canva-photos.json (from browser), member-emails.json (from sheets)
 * Output: matched-photos.json [{sacEmail, photoUrl, canvaName, sheetName}]
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const canvaPhotos = JSON.parse(readFileSync(join(__dirname, 'canva-photos.json'), 'utf8'))
const members = JSON.parse(readFileSync(join(__dirname, 'member-emails.json'), 'utf8'))

// Normalize: remove accents, lowercase
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Try to match a Canva name (e.g. "Omayra Gutiérrez") to a sheet member
// Sheet names are full (e.g. "Omayra Gutierrez Medina")
function findMember(canvaName) {
  const normCanva = normalize(canvaName)
  const canvaParts = normCanva.split(/\s+/)

  // Strategy 1: exact normalized match on full name
  for (const m of members) {
    if (!m.sacEmail) continue
    if (normalize(m.name) === normCanva) return m
  }

  // Strategy 2: sheet name starts with canva name (canva only has first name + surname)
  for (const m of members) {
    if (!m.sacEmail) continue
    const normSheet = normalize(m.name)
    if (normSheet.startsWith(normCanva + ' ') || normSheet === normCanva) return m
  }

  // Strategy 3: first token (first name) + second token (first surname) match
  if (canvaParts.length >= 2) {
    const firstName = canvaParts[0]
    const lastName = canvaParts[1]
    for (const m of members) {
      if (!m.sacEmail) continue
      const sheetParts = normalize(m.name).split(/\s+/)
      if (sheetParts[0] === firstName && sheetParts[1] === lastName) return m
    }
  }

  // Strategy 4: first token match only (fallback, risky — skip)
  return null
}

const matched = []
const unmatched = []

for (const photo of canvaPhotos) {
  const member = findMember(photo.name)
  if (member) {
    matched.push({
      sacEmail: member.sacEmail,
      photoUrl: photo.photoUrl,
      canvaName: photo.name,
      sheetName: member.name,
    })
  } else {
    unmatched.push(photo.name)
  }
}

console.log(`\nMatched: ${matched.length} / ${canvaPhotos.length}`)
console.log(`Unmatched: ${unmatched.length}`)
if (unmatched.length > 0) {
  console.log('Unmatched names:')
  unmatched.forEach((n) => console.log(`  - ${n}`))
}

const outPath = join(__dirname, 'matched-photos.json')
writeFileSync(outPath, JSON.stringify(matched, null, 2), 'utf8')
console.log(`\nWritten to ${outPath}`)
console.log('\nSample matches:')
matched.slice(0, 5).forEach((m) => console.log(`  "${m.canvaName}" → ${m.sacEmail}`))
