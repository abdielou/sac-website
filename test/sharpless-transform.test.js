const {
  parseSharplessTsv,
  parseAvedisovaTsv,
  ngcIcNameToCatalogId,
  buildSharplessToNgcIc,
  buildSharplessCatalog,
} = require('../scripts/lib/sharpless-transform')

describe('parseSharplessTsv', () => {
  const tsv = [
    '#comment line',
    'Sh2\t_RAJ2000\t_DEJ2000\tDiam',
    '\tdeg\tdeg\tarcmin',
    '---\t---\t---\t---',
    '1\t239.713366\t-26.120520\t150',
    '49\t274.700000\t-13.800000\t60',
    '50\t276.000000\t-14.000000\t',
  ].join('\n')

  test('parses data rows and skips header/units/separator/comments', () => {
    const rows = parseSharplessTsv(tsv)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ num: 1, name: 'Sh 2-1', ra: 239.713366, dec: -26.12052, diam: 150 })
    expect(rows[1]).toEqual({ num: 49, name: 'Sh 2-49', ra: 274.7, dec: -13.8, diam: 60 })
  })

  test('missing diameter becomes null', () => {
    const rows = parseSharplessTsv(tsv)
    expect(rows[2].diam).toBeNull()
  })
})

describe('parseAvedisovaTsv', () => {
  const tsv = [
    '#comment',
    'Name\tnSFR',
    '\t',
    '------\t-------',
    'S 49\t 16.80+0.75',
    'NGC 6611\t 16.80+0.75',
    'S 37\t 12.12-1.84',
    'IC 1283\t 12.12-1.84',
  ].join('\n')

  test('parses name/sfr rows, trims whitespace, skips non-data lines', () => {
    const rows = parseAvedisovaTsv(tsv)
    expect(rows).toEqual([
      { name: 'S 49', sfr: '16.80+0.75' },
      { name: 'NGC 6611', sfr: '16.80+0.75' },
      { name: 'S 37', sfr: '12.12-1.84' },
      { name: 'IC 1283', sfr: '12.12-1.84' },
    ])
  })
})

describe('ngcIcNameToCatalogId', () => {
  test('converts NGC/IC names to zero-padded catalog ids', () => {
    expect(ngcIcNameToCatalogId('NGC 6611')).toBe('NGC6611')
    expect(ngcIcNameToCatalogId('NGC 224')).toBe('NGC0224')
    expect(ngcIcNameToCatalogId('IC 1283')).toBe('IC1283')
    expect(ngcIcNameToCatalogId('IC 10')).toBe('IC0010')
  })

  test('returns null for non-NGC/IC names', () => {
    expect(ngcIcNameToCatalogId('S 49')).toBeNull()
    expect(ngcIcNameToCatalogId('Gum 83')).toBeNull()
    expect(ngcIcNameToCatalogId('M 16')).toBeNull()
  })

  test('returns null for suffixed NGC/IC names (avoids wrong cross-links)', () => {
    expect(ngcIcNameToCatalogId('NGC 5194A')).toBeNull()
    expect(ngcIcNameToCatalogId('IC 4628b')).toBeNull()
  })
})

describe('buildSharplessToNgcIc', () => {
  test('maps Sharpless numbers to NGC/IC ids sharing an SFR group', () => {
    const rows = [
      { name: 'S 49', sfr: '16.80+0.75' },
      { name: 'NGC 6611', sfr: '16.80+0.75' },
      { name: 'M 16', sfr: '16.80+0.75' },
      { name: 'S 37', sfr: '12.12-1.84' },
      { name: 'NGC 6595', sfr: '12.12-1.84' },
      { name: 'IC 1283', sfr: '12.12-1.84' },
      { name: 'S 1', sfr: '0.00+0.00' },
    ]
    const map = buildSharplessToNgcIc(rows)
    expect(map.get(49)).toEqual(['NGC6611'])
    expect(map.get(37)).toEqual(['NGC6595', 'IC1283'])
    expect(map.has(1)).toBe(false) // no NGC/IC in its group
  })
})

describe('buildSharplessCatalog', () => {
  const sharplessObjs = [
    { num: 1, name: 'Sh 2-1', ra: 239.7, dec: -26.1, diam: 150 },
    { num: 49, name: 'Sh 2-49', ra: 274.7, dec: -13.8, diam: 60 },
    { num: 99, name: 'Sh 2-99', ra: 300.2, dec: 33.5, diam: null },
  ]
  const constellationOf = () => 'Ser'

  test('cross-links when the NGC/IC counterpart exists in the bundled catalog', () => {
    const out = buildSharplessCatalog({
      sharplessObjs,
      shToCatalogIds: new Map([[49, ['NGC6611']]]),
      existingIds: new Set(['NGC6611']),
      constellationOf,
    })
    expect(out.crossLinks).toEqual([{ id: 'NGC6611', sharpless: 'Sh 2-49' }])
    // Sh 2-1 and Sh 2-99 have no counterpart -> standalone
    expect(out.standalone.map((o) => o.id)).toEqual(['SH2-1', 'SH2-99'])
  })

  test('standalone record has the required shape', () => {
    const out = buildSharplessCatalog({
      sharplessObjs: [sharplessObjs[0]],
      shToCatalogIds: new Map(),
      existingIds: new Set(),
      constellationOf,
    })
    expect(out.standalone[0]).toEqual({
      id: 'SH2-1',
      name: 'Sh 2-1',
      catalogIds: { ngc: null, ic: null, messier: null, sharpless: 'Sh 2-1' },
      ra: 239.7,
      dec: -26.1,
      magnitude: null,
      angularSize: { major: 150, minor: 150 },
      objectType: 'HII Region',
      constellation: 'Ser',
      commonName: null,
      commonNameEs: null,
    })
  })

  test('falls back to standalone when the mapped NGC/IC is NOT in the bundled catalog', () => {
    const out = buildSharplessCatalog({
      sharplessObjs: [sharplessObjs[1]],
      shToCatalogIds: new Map([[49, ['NGC9999']]]),
      existingIds: new Set(), // NGC9999 not present
      constellationOf,
    })
    expect(out.crossLinks).toEqual([])
    expect(out.standalone[0].id).toBe('SH2-49')
  })

  test('null diameter yields null angularSize fields', () => {
    const out = buildSharplessCatalog({
      sharplessObjs: [sharplessObjs[2]],
      shToCatalogIds: new Map(),
      existingIds: new Set(),
      constellationOf,
    })
    expect(out.standalone[0].angularSize).toEqual({ major: null, minor: null })
  })
})
