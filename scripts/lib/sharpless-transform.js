/**
 * Pure transforms for building the Sharpless catalog. No network, no FS — so
 * these are unit-tested directly. The build script injects `constellationOf`
 * and the I/O.
 */

const SFR_RE = /^\d{1,3}\.\d+[-+]\d+\.\d+$/

/** Parse VizieR VII/20 asu-tsv (columns: Sh2, _RAJ2000, _DEJ2000, Diam). */
function parseSharplessTsv(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    if (line.startsWith('Sh2') || line.startsWith('\t')) continue
    const parts = line.split('\t').map((s) => s.trim())
    if (parts.length < 3) continue
    const num = parseInt(parts[0], 10)
    const ra = parseFloat(parts[1])
    const dec = parseFloat(parts[2])
    if (Number.isNaN(num) || Number.isNaN(ra) || Number.isNaN(dec)) continue
    const diamRaw = parts[3]
    const diam = diamRaw && !Number.isNaN(parseFloat(diamRaw)) ? parseFloat(diamRaw) : null
    rows.push({ num, name: `Sh 2-${num}`, ra, dec, diam })
  }
  return rows.sort((a, b) => a.num - b.num)
}

/** Parse VizieR V/112A namelist asu-tsv (columns: Name, nSFR). */
function parseAvedisovaTsv(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('Name')) continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    const name = parts[0].trim()
    const sfr = parts[1].trim()
    if (!name || !SFR_RE.test(sfr)) continue
    rows.push({ name, sfr })
  }
  return rows
}

/** "NGC 6611" -> "NGC6611", "IC 10" -> "IC0010". Non-NGC/IC -> null. */
function ngcIcNameToCatalogId(name) {
  const m = name.match(/^(NGC|IC)\s*0*(\d+)/i)
  if (!m) return null
  return `${m[1].toUpperCase()}${m[2].padStart(4, '0')}`
}

/** Map Sharpless number -> [NGC/IC catalog ids] sharing an Avedisova SFR group. */
function buildSharplessToNgcIc(rows) {
  const bySfr = new Map()
  for (const { name, sfr } of rows) {
    if (!bySfr.has(sfr)) bySfr.set(sfr, [])
    bySfr.get(sfr).push(name)
  }
  const result = new Map()
  for (const names of bySfr.values()) {
    const shNums = []
    const catIds = []
    for (const n of names) {
      const sh = n.match(/^S\s+(\d+)$/)
      if (sh) {
        shNums.push(parseInt(sh[1], 10))
        continue
      }
      const id = ngcIcNameToCatalogId(n)
      if (id && !catIds.includes(id)) catIds.push(id)
    }
    if (catIds.length === 0) continue
    for (const num of shNums) {
      const existing = result.get(num) || []
      for (const id of catIds) if (!existing.includes(id)) existing.push(id)
      result.set(num, existing)
    }
  }
  return result
}

/** Build the sharpless.json payload: standalone records + cross-link overlays. */
function buildSharplessCatalog({ sharplessObjs, shToCatalogIds, existingIds, constellationOf }) {
  const standalone = []
  const crossLinks = []

  for (const sh of sharplessObjs) {
    const candidates = shToCatalogIds.get(sh.num) || []
    const matched = candidates.find((id) => existingIds.has(id))

    if (matched) {
      crossLinks.push({ id: matched, sharpless: sh.name })
      continue
    }

    standalone.push({
      id: `SH2-${sh.num}`,
      name: sh.name,
      catalogIds: { ngc: null, ic: null, messier: null, sharpless: sh.name },
      ra: sh.ra,
      dec: sh.dec,
      magnitude: null,
      angularSize: { major: sh.diam ?? null, minor: sh.diam ?? null },
      objectType: 'HII Region',
      constellation: constellationOf(sh.ra, sh.dec),
      commonName: null,
      commonNameEs: null,
    })
  }

  return { standalone, crossLinks }
}

module.exports = {
  parseSharplessTsv,
  parseAvedisovaTsv,
  ngcIcNameToCatalogId,
  buildSharplessToNgcIc,
  buildSharplessCatalog,
}
