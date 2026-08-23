import { parseTagInput, mergeTags } from '@/lib/utils/tagInput'

describe('parseTagInput', () => {
  it('splits a comma separated list into separate tags', () => {
    expect(parseTagInput('Marte, planeta Marte, eclipse desde')).toEqual([
      'Marte',
      'planeta Marte',
      'eclipse desde',
    ])
  })

  it('returns a single tag when there is no separator', () => {
    expect(parseTagInput('planeta Marte')).toEqual(['planeta Marte'])
  })

  it('trims surrounding whitespace on each tag', () => {
    expect(parseTagInput('  Marte ,   Luna  ')).toEqual(['Marte', 'Luna'])
  })

  it('drops empty segments from extra separators', () => {
    expect(parseTagInput('Marte,,Luna,')).toEqual(['Marte', 'Luna'])
  })

  it('collapses repeated inner whitespace', () => {
    expect(parseTagInput('planeta   Marte')).toEqual(['planeta Marte'])
  })

  it('splits on newlines from pasted lists', () => {
    expect(parseTagInput('Marte\nLuna')).toEqual(['Marte', 'Luna'])
  })

  it('removes duplicates inside one input', () => {
    expect(parseTagInput('Marte, Marte')).toEqual(['Marte'])
  })

  it('returns an empty list for blank or non-string input', () => {
    expect(parseTagInput('   ')).toEqual([])
    expect(parseTagInput(',,')).toEqual([])
    expect(parseTagInput(null)).toEqual([])
    expect(parseTagInput(undefined)).toEqual([])
  })
})

describe('mergeTags', () => {
  it('appends every parsed tag to the existing list', () => {
    expect(mergeTags(['Luna'], 'Marte, eclipse desde')).toEqual(['Luna', 'Marte', 'eclipse desde'])
  })

  it('skips tags already selected', () => {
    expect(mergeTags(['Marte'], 'Marte, Luna')).toEqual(['Marte', 'Luna'])
  })

  it('returns the same array reference when nothing new is added', () => {
    const existing = ['Marte']
    expect(mergeTags(existing, 'Marte')).toBe(existing)
    expect(mergeTags(existing, '  ')).toBe(existing)
  })

  it('tolerates a missing existing list', () => {
    expect(mergeTags(undefined, 'Marte, Luna')).toEqual(['Marte', 'Luna'])
  })
})
