/**
 * Build script that downloads OpenNGC CSV data and Stellarium Spanish names,
 * merges them into a structured JSON catalog for the SAC website.
 *
 * Usage: node scripts/build-catalog.mjs
 *
 * Sources:
 * - OpenNGC: https://github.com/mattiaverga/OpenNGC
 * - Stellarium Spanish names: https://github.com/Stellarium/stellarium
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data', 'catalog')

// OpenNGC CSV URL
const OPENNGC_CSV_URL =
  'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv'

// Stellarium names.dat maps catalog IDs to English names
const STELLARIUM_NAMES_URL =
  'https://raw.githubusercontent.com/Stellarium/stellarium/master/nebulae/default/names.dat'
// Stellarium Spanish sky translations (.po file with DSO names)
const STELLARIUM_ES_PO_URL =
  'https://raw.githubusercontent.com/Stellarium/stellarium/master/po/stellarium-sky/es.po'

// OpenNGC type code to human-readable mapping
const TYPE_MAP = {
  '*': 'Star',
  '**': 'Double Star',
  '*Ass': 'Association',
  OCl: 'Open Cluster',
  GCl: 'Globular Cluster',
  'Cl+N': 'Cluster + Nebula',
  GGroup: 'Galaxy Group',
  GPair: 'Galaxy Pair',
  GTrpl: 'Galaxy Triplet',
  G: 'Galaxy',
  PN: 'Planetary Nebula',
  HII: 'HII Region',
  DrkN: 'Dark Nebula',
  EmN: 'Emission Nebula',
  Neb: 'Nebula',
  RfN: 'Reflection Nebula',
  SNR: 'Supernova Remnant',
  Nova: 'Nova',
  NonEx: 'Nonexistent',
  Dup: 'Duplicate',
  Other: 'Other',
}

/**
 * Convert RA from HH:MM:SS.s to decimal degrees
 */
function raToDecimalDegrees(ra) {
  if (!ra || ra.trim() === '') return null
  const parts = ra.split(':')
  if (parts.length !== 3) return null
  const hours = parseFloat(parts[0])
  const minutes = parseFloat(parts[1])
  const seconds = parseFloat(parts[2])
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null
  return Math.round((hours * 15 + minutes / 4 + seconds / 240) * 10000) / 10000
}

/**
 * Convert Dec from +DD:MM:SS.s to decimal degrees
 */
function decToDecimalDegrees(dec) {
  if (!dec || dec.trim() === '') return null
  const sign = dec.startsWith('-') ? -1 : 1
  const cleaned = dec.replace(/^[+-]/, '')
  const parts = cleaned.split(':')
  if (parts.length !== 3) return null
  const degrees = parseFloat(parts[0])
  const minutes = parseFloat(parts[1])
  const seconds = parseFloat(parts[2])
  if (isNaN(degrees) || isNaN(minutes) || isNaN(seconds)) return null
  return Math.round(sign * (degrees + minutes / 60 + seconds / 3600) * 10000) / 10000
}

/**
 * Parse Stellarium names.dat to get English name -> catalog ID mapping
 * Format: "NGC  224             _("Andromeda Galaxy") # source"
 * Columns: 1-5=prefix, 6-20=id, 21+=_("name") [# comment]
 */
function parseStellariumNames(text) {
  // Map: English name -> array of catalog IDs (e.g., "NGC0224")
  const nameToIds = {}
  // Map: catalog ID -> first English name
  const idToName = {}

  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue

    // Parse fixed-width: prefix (1-5), id (6-20), name (21+)
    const prefix = (line.substring(0, 5) || '').trim()
    const idPart = (line.substring(5, 20) || '').trim()
    const rest = (line.substring(20) || '').trim()

    if (!prefix || !idPart || !rest) continue

    // Extract name from _("...") pattern
    const nameMatch = rest.match(/_\("([^"]+)"\)/)
    if (!nameMatch) continue

    const englishName = nameMatch[1]
    const catId = `${prefix}${idPart.padStart(prefix === 'IC' ? 4 : 4, '0')}`

    if (!nameToIds[englishName]) {
      nameToIds[englishName] = []
    }
    nameToIds[englishName].push(catId)

    // Store first name for this ID
    if (!idToName[catId]) {
      idToName[catId] = englishName
    }
  }

  return { nameToIds, idToName }
}

/**
 * Parse .po file for msgid/msgstr pairs
 */
function parsePo(text) {
  const translations = {}
  const lines = text.split('\n')
  let currentMsgId = null
  let collectingMsgId = false
  let collectingMsgStr = false
  let msgStrParts = []

  function finishEntry() {
    if (currentMsgId && msgStrParts.length > 0) {
      const msgStr = msgStrParts.join('')
      if (msgStr) {
        translations[currentMsgId] = msgStr
      }
    }
    currentMsgId = null
    msgStrParts = []
    collectingMsgId = false
    collectingMsgStr = false
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('msgid "')) {
      finishEntry()
      const val = trimmed.slice(7, -1)
      currentMsgId = val
      collectingMsgId = true
      collectingMsgStr = false
    } else if (trimmed.startsWith('msgstr "')) {
      collectingMsgId = false
      collectingMsgStr = true
      const val = trimmed.slice(8, -1)
      msgStrParts.push(val)
    } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      const val = trimmed.slice(1, -1)
      if (collectingMsgId) {
        currentMsgId = (currentMsgId || '') + val
      } else if (collectingMsgStr) {
        msgStrParts.push(val)
      }
    } else {
      // Non-continuation line; finish any pending entry
      if (currentMsgId && collectingMsgStr) {
        finishEntry()
      }
    }
  }
  finishEntry()

  return translations
}

/**
 * Build Spanish name mapping from Stellarium data.
 * Downloads names.dat (English names for DSOs) and es.po (Spanish translations).
 */
async function buildSpanishNames() {
  console.log('Downloading Stellarium names.dat...')
  const namesRes = await fetch(STELLARIUM_NAMES_URL)
  if (!namesRes.ok) throw new Error(`Failed to download names.dat: HTTP ${namesRes.status}`)
  const namesText = await namesRes.text()
  const { idToName } = parseStellariumNames(namesText)
  console.log(`  Parsed ${Object.keys(idToName).length} catalog ID -> English name mappings`)

  console.log('Downloading Stellarium Spanish translations...')
  const poRes = await fetch(STELLARIUM_ES_PO_URL)
  if (!poRes.ok) throw new Error(`Failed to download es.po: HTTP ${poRes.status}`)
  const poText = await poRes.text()

  const translations = parsePo(poText)
  console.log(`  Parsed ${Object.keys(translations).length} Spanish translations from .po file`)

  // Filter to only astronomy-relevant names (skip empty and UI strings)
  const spanishNames = {}
  for (const [en, es] of Object.entries(translations)) {
    if (!en || !es || en === es) continue
    if (en.includes('%') || en.includes('{') || en.length > 100) continue
    spanishNames[en] = es
  }

  console.log(`  Filtered to ${Object.keys(spanishNames).length} name translations`)
  return { spanishNames, idToName }
}

/**
 * Parse OpenNGC CSV and merge with Spanish names
 */
async function buildCatalog() {
  console.log('Downloading OpenNGC CSV...')
  const csvRes = await fetch(OPENNGC_CSV_URL)
  if (!csvRes.ok) throw new Error(`Failed to download OpenNGC CSV: HTTP ${csvRes.status}`)
  const csvText = await csvRes.text()

  const lines = csvText.split('\n')
  const header = lines[0].split(';')
  console.log(`  CSV has ${lines.length} lines, ${header.length} columns`)

  // Build column index
  const col = {}
  header.forEach((h, i) => {
    col[h.trim()] = i
  })

  // Get Spanish names and Stellarium ID-to-name mapping
  const { spanishNames, idToName } = await buildSpanishNames()

  // Parse Messier cross-references from CSV (M column)
  const catalog = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = line.split(';')
    const name = (fields[col['Name']] || '').trim()
    if (!name) {
      skipped++
      continue
    }

    const typeCode = (fields[col['Type']] || '').trim()
    const objectType = TYPE_MAP[typeCode] || typeCode || 'Other'

    const raStr = (fields[col['RA']] || '').trim()
    const decStr = (fields[col['Dec']] || '').trim()
    const ra = raToDecimalDegrees(raStr)
    const dec = decToDecimalDegrees(decStr)

    // Skip objects with no coordinates (can't be observed)
    if (ra === null || dec === null) {
      skipped++
      continue
    }

    const constellation = (fields[col['Const']] || '').trim() || null
    if (!constellation) {
      skipped++
      continue
    }

    const messier = (fields[col['M']] || '').trim()
    const vMag = (fields[col['V-Mag']] || '').trim()
    const majAx = (fields[col['MajAx']] || '').trim()
    const minAx = (fields[col['MinAx']] || '').trim()
    const commonName = (fields[col['Common names']] || '').trim() || null

    // Build catalog IDs (strip leading zeros for display)
    const isNGC = name.startsWith('NGC')
    const isIC = name.startsWith('IC')
    const numPart = name.replace(/^[A-Z]+/, '')
    const numClean = numPart.replace(/^0+/, '') || '0'

    const catalogIds = {
      ngc: isNGC ? `NGC ${numClean}` : null,
      ic: isIC ? `IC ${numClean}` : null,
      messier: messier ? `M ${messier.replace(/^0+/, '')}` : null,
    }

    // Format display name with space (no leading zeros)
    const displayName = isNGC ? `NGC ${numClean}` : isIC ? `IC ${numClean}` : name

    // Look up Spanish name: try OpenNGC common name first, then Stellarium names.dat
    let commonNameEs = null
    if (commonName) {
      // Try exact match first, then try individual names (some have comma-separated)
      const cnames = commonName.split(',').map((n) => n.trim())
      for (const n of cnames) {
        if (spanishNames[n]) {
          commonNameEs = spanishNames[n]
          break
        }
      }
    }
    // Fallback: look up via Stellarium names.dat (maps catalog ID to English name)
    if (!commonNameEs && idToName[name]) {
      const stellariumName = idToName[name]
      if (spanishNames[stellariumName]) {
        commonNameEs = spanishNames[stellariumName]
      }
    }

    catalog.push({
      id: name,
      name: displayName,
      catalogIds,
      ra,
      dec,
      magnitude: vMag ? parseFloat(vMag) : null,
      angularSize: {
        major: majAx ? parseFloat(majAx) : null,
        minor: minAx ? parseFloat(minAx) : null,
      },
      objectType,
      constellation,
      commonName: commonName ? commonName.split(',')[0].trim() : null,
      commonNameEs,
    })
  }

  console.log(
    `  Parsed ${catalog.length} objects (skipped ${skipped} without coords/constellation)`
  )

  // Count Spanish names
  const withSpanish = catalog.filter((o) => o.commonNameEs).length
  console.log(`  ${withSpanish} objects have Spanish common names`)

  return { catalog, spanishNames }
}

async function main() {
  console.log('Building OpenNGC catalog with Spanish names...\n')

  mkdirSync(DATA_DIR, { recursive: true })

  const { catalog, spanishNames } = await buildCatalog()

  // Write Spanish names mapping
  const spanishPath = join(DATA_DIR, 'spanish-names.json')
  writeFileSync(spanishPath, JSON.stringify(spanishNames, null, 2))
  console.log(`\nWrote ${Object.keys(spanishNames).length} Spanish names to ${spanishPath}`)

  // Write full catalog
  const catalogPath = join(DATA_DIR, 'openngc.json')
  writeFileSync(catalogPath, JSON.stringify(catalog))
  console.log(`Wrote ${catalog.length} objects to ${catalogPath}`)

  // Print stats
  const types = {}
  for (const obj of catalog) {
    types[obj.objectType] = (types[obj.objectType] || 0) + 1
  }
  console.log('\nObject type distribution:')
  for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }

  console.log('\nDone!')
}

main().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
