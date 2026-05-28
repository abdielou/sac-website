import {
  parseFamilyMembers,
  serializeFamilyMembers,
  parseFamilyMemberPhotos,
  serializeFamilyMemberPhotos,
  nameToPhotoSlug,
  sanitizeFamilyMemberName,
  sanitizeFamilyMemberNames,
} from '../lib/family-members'

describe('parseFamilyMembers', () => {
  it('parses semicolon-separated names with trimming', () => {
    expect(parseFamilyMembers('  Ana; Bob ;  ')).toEqual(['Ana', 'Bob'])
  })

  it('returns empty array for empty string', () => {
    expect(parseFamilyMembers('')).toEqual([])
  })

  it('returns empty array for null/undefined', () => {
    expect(parseFamilyMembers(null)).toEqual([])
    expect(parseFamilyMembers(undefined)).toEqual([])
  })
})

describe('serializeFamilyMembers', () => {
  it('joins names with semicolon and space', () => {
    expect(serializeFamilyMembers(['Ana', 'Bob'])).toBe('Ana; Bob')
  })

  it('returns empty string for empty array', () => {
    expect(serializeFamilyMembers([])).toBe('')
  })

  it('round-trips with parseFamilyMembers', () => {
    const names = ['María López', 'Juan Pérez']
    expect(parseFamilyMembers(serializeFamilyMembers(names))).toEqual(names)
  })
})

describe('parseFamilyMemberPhotos', () => {
  it('parses valid JSON object', () => {
    expect(parseFamilyMemberPhotos('{"Ana":"id1"}')).toEqual({ Ana: 'id1' })
  })

  it('returns empty object for empty string', () => {
    expect(parseFamilyMemberPhotos('')).toEqual({})
  })

  it('returns empty object for invalid JSON', () => {
    expect(parseFamilyMemberPhotos('not-json')).toEqual({})
  })
})

describe('serializeFamilyMemberPhotos', () => {
  it('serializes photos object to JSON', () => {
    expect(serializeFamilyMemberPhotos({ Ana: 'id1' })).toBe('{"Ana":"id1"}')
  })

  it('returns empty string for empty object', () => {
    expect(serializeFamilyMemberPhotos({})).toBe('')
  })

  it('round-trips with parseFamilyMemberPhotos', () => {
    const photos = { 'María López': 'abc123' }
    expect(parseFamilyMemberPhotos(serializeFamilyMemberPhotos(photos))).toEqual(photos)
  })
})

describe('nameToPhotoSlug', () => {
  it('normalizes accented names to lowercase hyphenated slug', () => {
    expect(nameToPhotoSlug('María López')).toBe('maria-lopez')
  })

  it('collapses multiple separators', () => {
    expect(nameToPhotoSlug('Ana  Maria')).toBe('ana-maria')
  })

  it('returns empty string for empty input', () => {
    expect(nameToPhotoSlug('')).toBe('')
  })
})

describe('sanitizeFamilyMemberName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeFamilyMemberName('  Ana   Maria  ')).toBe('Ana Maria')
  })

  it('removes semicolons', () => {
    expect(sanitizeFamilyMemberName('Ana; Bob')).toBe('Ana Bob')
  })

  it('removes control characters', () => {
    expect(sanitizeFamilyMemberName('Ana\u0000Maria')).toBe('AnaMaria')
  })

  it('enforces max length', () => {
    expect(sanitizeFamilyMemberName('a'.repeat(120)).length).toBe(100)
  })
})

describe('sanitizeFamilyMemberNames', () => {
  it('filters empty entries and rejects duplicates', () => {
    expect(sanitizeFamilyMemberNames(['Ana', '', '  ', 'Bob', 'Ana'])).toEqual({
      names: [],
      error: 'No puede haber nombres duplicados',
    })
  })

  it('returns sanitized unique names', () => {
    expect(sanitizeFamilyMemberNames(['  Ana ', 'Bob', ''])).toEqual({
      names: ['Ana', 'Bob'],
      error: null,
    })
  })
})
