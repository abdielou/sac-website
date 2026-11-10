import {
  MANUAL_OBJECT_TYPES,
  isManualObjectId,
  manualToCatalog,
  newManualObjectId,
  parseCoordinate,
  validateGuideEntries,
  validateManualObject,
} from '../lib/guide-manual-object'

describe('parseCoordinate', () => {
  test('reads one number as decimal degrees on both axes', () => {
    expect(parseCoordinate('150.2', 'ra')).toBeCloseTo(150.2)
    expect(parseCoordinate('-12.5', 'dec')).toBeCloseTo(-12.5)
    expect(parseCoordinate(' 0 ', 'ra')).toBe(0)
  })

  test('reads RA sexagesimal as hours', () => {
    expect(parseCoordinate('10 00 48', 'ra')).toBeCloseTo(150.2)
    expect(parseCoordinate('10:00:48', 'ra')).toBeCloseTo(150.2)
    expect(parseCoordinate('10h 00m 48s', 'ra')).toBeCloseTo(150.2)
    expect(parseCoordinate('5h35m', 'ra')).toBeCloseTo(83.75)
  })

  test('reads Dec sexagesimal as degrees with the sign on the whole value', () => {
    expect(parseCoordinate('+12 18 00', 'dec')).toBeCloseTo(12.3)
    expect(parseCoordinate('-05:23:28', 'dec')).toBeCloseTo(-5.391111, 5)
    expect(parseCoordinate('-00 30 00', 'dec')).toBeCloseTo(-0.5)
    expect(parseCoordinate('22° 0′ 52″', 'dec')).toBeCloseTo(22.014444, 5)
    expect(parseCoordinate('22° 0\' 52"', 'dec')).toBeCloseTo(22.014444, 5)
  })

  test('returns null for empty or invalid text', () => {
    expect(parseCoordinate('', 'ra')).toBeNull()
    expect(parseCoordinate(null, 'ra')).toBeNull()
    expect(parseCoordinate('abc', 'ra')).toBeNull()
    expect(parseCoordinate('10 61 00', 'ra')).toBeNull()
    expect(parseCoordinate('10 00 60', 'dec')).toBeNull()
    expect(parseCoordinate('1 2 3 4', 'ra')).toBeNull()
    expect(parseCoordinate('-10 00 00', 'ra')).toBeNull()
  })

  test('returns null when the value is out of range', () => {
    expect(parseCoordinate('360', 'ra')).toBeNull()
    expect(parseCoordinate('24 00 00', 'ra')).toBeNull()
    expect(parseCoordinate('-1', 'ra')).toBeNull()
    expect(parseCoordinate('90.5', 'dec')).toBeNull()
    expect(parseCoordinate('-91 00 00', 'dec')).toBeNull()
  })

  test('passes finite numbers through with the same range check', () => {
    expect(parseCoordinate(12.5, 'dec')).toBe(12.5)
    expect(parseCoordinate(400, 'ra')).toBeNull()
  })
})

describe('validateManualObject', () => {
  const ID = 'manual-abc123'

  test('accepts a name-only object and drops empty and unknown fields', () => {
    const result = validateManualObject(ID, { name: '  Júpiter ', designation: '', foo: 'bar' })
    expect(result).toEqual({ ok: true, value: { name: 'Júpiter' } })
  })

  test('cleans every field', () => {
    const result = validateManualObject(ID, {
      name: 'Cometa C/2025 A1',
      designation: ' C/2025 A1 ',
      objectType: 'Cometa',
      constellation: 'Leo',
      magnitude: '6.5',
      ra: '10 00 48',
      dec: '+12 18 00',
      imageUrl: 'https://example.com/a.jpg',
      imageCredit: 'NASA/JPL',
    })
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({
      name: 'Cometa C/2025 A1',
      designation: 'C/2025 A1',
      objectType: 'Cometa',
      constellation: 'Leo',
      magnitude: 6.5,
      ra: expect.closeTo(150.2, 5),
      dec: expect.closeTo(12.3, 5),
      imageUrl: 'https://example.com/a.jpg',
      imageCredit: 'NASA/JPL',
    })
  })

  test('rejects a bad objectId', () => {
    const result = validateManualObject('NGC0224', { name: 'X' })
    expect(result.ok).toBe(false)
    expect(result.errors.objectId).toBeDefined()
  })

  test('rejects a missing or long name', () => {
    expect(validateManualObject(ID, { name: '  ' }).errors.name).toBeDefined()
    expect(validateManualObject(ID, {}).errors.name).toBeDefined()
    expect(validateManualObject(ID, { name: 'x'.repeat(121) }).errors.name).toBeDefined()
    expect(validateManualObject(ID, { name: 'x'.repeat(120) }).ok).toBe(true)
  })

  test('rejects a manual block that is not an object', () => {
    expect(validateManualObject(ID, null).ok).toBe(false)
    expect(validateManualObject(ID, 'Júpiter').ok).toBe(false)
  })

  test('limits the short text fields to 60 and the credit to 120 characters', () => {
    const long = 'x'.repeat(61)
    const errors = validateManualObject(ID, {
      name: 'X',
      designation: long,
      objectType: long,
      constellation: long,
      imageCredit: 'x'.repeat(121),
    }).errors
    expect(Object.keys(errors).sort()).toEqual(
      ['constellation', 'designation', 'imageCredit', 'objectType'].sort()
    )
  })

  test('rejects a magnitude that is not a number or out of range', () => {
    expect(
      validateManualObject(ID, { name: 'X', magnitude: 'brillante' }).errors.magnitude
    ).toBeDefined()
    expect(validateManualObject(ID, { name: 'X', magnitude: 31 }).errors.magnitude).toBeDefined()
    expect(validateManualObject(ID, { name: 'X', magnitude: -26.7 }).value.magnitude).toBe(-26.7)
    expect(validateManualObject(ID, { name: 'X', magnitude: 0 }).value.magnitude).toBe(0)
  })

  test('needs both coordinates or neither', () => {
    expect(validateManualObject(ID, { name: 'X', ra: '150' }).errors.dec).toBeDefined()
    expect(validateManualObject(ID, { name: 'X', dec: '12' }).errors.ra).toBeDefined()
    expect(validateManualObject(ID, { name: 'X', ra: '400', dec: '12' }).errors.ra).toBeDefined()
    expect(validateManualObject(ID, { name: 'X', ra: 0, dec: 0 }).value).toEqual({
      name: 'X',
      ra: 0,
      dec: 0,
    })
  })

  test('accepts only https image URLs', () => {
    expect(
      validateManualObject(ID, { name: 'X', imageUrl: 'http://a.com/x.jpg' }).errors.imageUrl
    ).toBeDefined()
    expect(
      validateManualObject(ID, { name: 'X', imageUrl: 'javascript:alert(1)' }).errors.imageUrl
    ).toBeDefined()
    expect(
      validateManualObject(ID, { name: 'X', imageUrl: 'not a url' }).errors.imageUrl
    ).toBeDefined()
    expect(
      validateManualObject(ID, { name: 'X', imageUrl: `https://a.com/${'x'.repeat(2048)}` }).errors
        .imageUrl
    ).toBeDefined()
  })

  test('accepts a /local-s3/ path only when local images are allowed', () => {
    const manual = { name: 'X', imageUrl: '/local-s3/images/guides/a.jpg' }
    expect(validateManualObject(ID, manual).errors.imageUrl).toBeDefined()
    expect(validateManualObject(ID, manual, { allowLocalImages: true }).value.imageUrl).toBe(
      '/local-s3/images/guides/a.jpg'
    )
    expect(
      validateManualObject(ID, { name: 'X', imageUrl: '/other/a.jpg' }, { allowLocalImages: true })
        .errors.imageUrl
    ).toBeDefined()
  })

  test('returns Spanish messages', () => {
    const { errors } = validateManualObject(ID, { name: '' })
    expect(errors.name).toMatch(/nombre/i)
  })
})

describe('manualToCatalog', () => {
  test('maps the designation to name and the display name to commonNameEs', () => {
    expect(
      manualToCatalog({
        name: 'Cometa C/2025 A1',
        designation: 'C/2025 A1',
        objectType: 'Cometa',
        constellation: 'Leo',
        magnitude: 6.5,
        ra: 150.2,
        dec: 12.3,
        imageUrl: 'https://a.com/x.jpg',
      })
    ).toEqual({
      id: null,
      name: 'C/2025 A1',
      commonNameEs: 'Cometa C/2025 A1',
      objectType: 'Cometa',
      constellation: 'Leo',
      magnitude: 6.5,
      ra: 150.2,
      dec: 12.3,
    })
  })

  test('fills missing fields with empty values', () => {
    expect(manualToCatalog({ name: 'Júpiter' })).toEqual({
      id: null,
      name: '',
      commonNameEs: 'Júpiter',
      objectType: null,
      constellation: null,
      magnitude: null,
      ra: null,
      dec: null,
    })
  })

  test('returns null when there is no manual block', () => {
    expect(manualToCatalog(null)).toBeNull()
    expect(manualToCatalog(undefined)).toBeNull()
  })
})

describe('ids and type suggestions', () => {
  test('newManualObjectId makes valid, distinct ids', () => {
    const a = newManualObjectId()
    const b = newManualObjectId()
    expect(isManualObjectId(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  test('isManualObjectId checks the format', () => {
    expect(isManualObjectId('manual-k3x9f2')).toBe(true)
    expect(isManualObjectId('manual-')).toBe(false)
    expect(isManualObjectId('manual-ABC')).toBe(false)
    expect(isManualObjectId('NGC0224')).toBe(false)
    expect(isManualObjectId(undefined)).toBe(false)
  })

  test('lists the type suggestions', () => {
    expect(MANUAL_OBJECT_TYPES).toEqual(
      expect.arrayContaining(['Planeta', 'Luna', 'Cometa', 'Asterismo', 'Evento'])
    )
  })
})

describe('validateGuideEntries', () => {
  const catalogEntry = { objectId: 'NGC0224', difficulty: 'facil', notes: '' }

  test('passes undefined through so a PUT can omit entries', () => {
    expect(validateGuideEntries(undefined)).toEqual({ ok: true, entries: undefined })
  })

  test('rejects entries that are not an array', () => {
    expect(validateGuideEntries('x').ok).toBe(false)
  })

  test('keeps catalog entries and cleans manual ones', () => {
    const result = validateGuideEntries([
      catalogEntry,
      { objectId: 'manual-a1', manual: { name: ' Júpiter ', extra: 1 }, notes: 'Brillante' },
    ])
    expect(result).toEqual({
      ok: true,
      entries: [
        catalogEntry,
        { objectId: 'manual-a1', manual: { name: 'Júpiter' }, notes: 'Brillante' },
      ],
    })
  })

  test('names the position and field of the first bad manual entry', () => {
    const result = validateGuideEntries([
      catalogEntry,
      { objectId: 'manual-a1', manual: { name: 'X', magnitude: 'alta' } },
    ])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^Objeto manual 2 inválido: La magnitud/)
    expect(result.details).toBe('entries[1].manual.magnitude is invalid')
  })

  test('rejects a manual id without a manual block', () => {
    expect(validateGuideEntries([{ objectId: 'manual-a1' }]).ok).toBe(false)
  })

  test('rejects a manual block on a catalog id', () => {
    expect(validateGuideEntries([{ objectId: 'NGC0224', manual: { name: 'X' } }]).ok).toBe(false)
  })

  test('forwards allowLocalImages', () => {
    const entries = [{ objectId: 'manual-a1', manual: { name: 'X', imageUrl: '/local-s3/a.jpg' } }]
    expect(validateGuideEntries(entries).ok).toBe(false)
    expect(validateGuideEntries(entries, { allowLocalImages: true }).ok).toBe(true)
  })
})
