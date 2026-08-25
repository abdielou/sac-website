/**
 * Tag URL slugs must be pure ASCII.
 *
 * github-slugger preserves accents, so tag URLs looked like
 * `/tags/astronom%C3%ADa`. In production EVERY accented tag returned 404 while
 * plain-ASCII tags served fine, and the sitemap was submitting those broken
 * URLs. Probing both Unicode forms of one tag gave 404 for NFC and 500 for NFD.
 *
 * De-accenting removes the whole class of bug. These tests pin that, and pin the
 * separation between the URL slug (ASCII) and the stored tag (accented display
 * text a Spanish reader sees).
 */
import kebabCase from '@/lib/utils/kebabCase'

const ASCII_ONLY = /^[a-z0-9/-]*$/

describe('kebabCase', () => {
  it('strips accents from single words', () => {
    expect(kebabCase('astronomía')).toBe('astronomia')
    expect(kebabCase('colaboración')).toBe('colaboracion')
    expect(kebabCase('bólido')).toBe('bolido')
    expect(kebabCase('satélite')).toBe('satelite')
  })

  it('handles ñ and ü, which Spanish needs and NFD does not fold away by accident', () => {
    expect(kebabCase('niños')).toBe('ninos')
    expect(kebabCase('pingüino')).toBe('pinguino')
    expect(kebabCase('España')).toBe('espana')
  })

  it('strips accents across a whole phrase', () => {
    expect(kebabCase('a qué hora se verá el eclipse lunar en puerto rico')).toBe(
      'a-que-hora-se-vera-el-eclipse-lunar-en-puerto-rico'
    )
  })

  it('produces pure ASCII for every real tag in the corpus vocabulary', () => {
    const corpus = [
      'cometa',
      'meteoro',
      'astronomía',
      'colaboración',
      'bólido',
      'satélite',
      'misión de rescate swift',
      'meteoro sábado 22 de agosto',
      'china enviará nave a la luna',
      'qué día se verá el eclipse en puerto rico',
      '3i/atlas',
      'c/2025-r2-swan',
      'chang’e 7',
    ]
    for (const tag of corpus) {
      expect(kebabCase(tag)).toMatch(ASCII_ONLY)
    }
  })

  it('leaves already-ASCII tags untouched', () => {
    expect(kebabCase('cometa')).toBe('cometa')
    expect(kebabCase('nave hacia la luna')).toBe('nave-hacia-la-luna')
  })

  it('is idempotent, so re-slugging a slug is a no-op', () => {
    for (const tag of ['astronomía', 'niños y niñas', 'misión de rescate']) {
      expect(kebabCase(kebabCase(tag))).toBe(kebabCase(tag))
    }
  })

  it('gives the same answer for both Unicode forms of the same tag', () => {
    // The production mismatch: NFC 404, NFD 500. Both must now agree.
    const word = 'astronomía'
    expect(kebabCase(word.normalize('NFC'))).toBe(kebabCase(word.normalize('NFD')))
  })

  it('tolerates empty and nullish input', () => {
    expect(kebabCase('')).toBe('')
    expect(kebabCase(undefined)).toBe('')
    expect(kebabCase(null)).toBe('')
  })

  it('does not collapse two genuinely different tags into one slug', () => {
    // De-accenting must not silently merge unrelated topics.
    expect(kebabCase('luna')).not.toBe(kebabCase('lunas'))
    expect(kebabCase('meteoro')).not.toBe(kebabCase('meteorito'))
  })
})
