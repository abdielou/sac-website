/**
 * Generate data/catalog/sharpless.json.
 * Usage: node scripts/build-sharpless-catalog.mjs
 *
 * Sources (referenced, not hosted):
 *  - VizieR VII/20  — Sharpless (1959) catalog: number, RA/Dec J2000, diameter.
 *  - VizieR V/112A  — Avedisova SFR namelist: authoritative Sh<->NGC/IC concordance.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Constellation } from 'astronomy-engine'
import transform from './lib/sharpless-transform.js'

const { parseSharplessTsv, parseAvedisovaTsv, buildSharplessToNgcIc, buildSharplessCatalog } =
  transform

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'data', 'catalog', 'sharpless.json')

const SHARPLESS_URL =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII/20&-out=Sh2&-out=_RAJ2000&-out=_DEJ2000&-out=Diam&-out.max=unlimited'
const AVEDISOVA_URL =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=V/112A/namelist&-out=Name&-out=nSFR&-out.max=unlimited'

// astronomy-engine takes RA in sidereal HOURS; our RA is in degrees.
const constellationOf = (ra, dec) => Constellation(ra / 15, dec).symbol

async function fetchText(url, label) {
  console.log(`Fetching ${label}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`)
  return res.text()
}

async function main() {
  const sharplessObjs = parseSharplessTsv(await fetchText(SHARPLESS_URL, 'Sharpless VII/20'))
  console.log(`  ${sharplessObjs.length} Sharpless objects`)

  const avedisovaRows = parseAvedisovaTsv(await fetchText(AVEDISOVA_URL, 'Avedisova V/112A'))
  console.log(`  ${avedisovaRows.length} Avedisova namelist rows`)

  const shToCatalogIds = buildSharplessToNgcIc(avedisovaRows)

  const curated = JSON.parse(readFileSync(join(ROOT, 'data/catalog/openngc-curated.json'), 'utf-8'))
  const supplementary = JSON.parse(
    readFileSync(join(ROOT, 'data/catalog/supplementary.json'), 'utf-8')
  )
  const existingIds = new Set([...curated, ...supplementary].map((o) => o.id))

  const { standalone, crossLinks } = buildSharplessCatalog({
    sharplessObjs,
    shToCatalogIds,
    existingIds,
    constellationOf,
  })

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    source: 'VizieR VII/20 (Sharpless 1959) + V/112A (Avedisova) cross-IDs',
    standalone,
    crossLinks,
  }

  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`Wrote ${OUT}: ${standalone.length} standalone, ${crossLinks.length} cross-links`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
