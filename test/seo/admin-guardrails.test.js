// Editor guardrails and tag normalisation
//
// The taxonomy fragmented because tags were stored exactly as typed, and titles
// and summaries were written with no feedback on the length a SERP can show.
// These tests lock the pure helpers that stop both problems recurring.

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    putObject: jest.fn(() => ({ promise: jest.fn(() => Promise.resolve({})) })),
    getObject: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve({ Body: Buffer.from('{}') })),
    })),
    deleteObject: jest.fn(() => ({ promise: jest.fn(() => Promise.resolve({})) })),
  })),
}))

import { normaliseTags } from '@/lib/articles'
import {
  MISSING_TAGS_MESSAGE,
  SERP_TITLE_MAX,
  SUMMARY_MAX,
  SUMMARY_MAX_GOOD,
  SUMMARY_MIN_GOOD,
  TITLE_LIMIT,
  TITLE_SUFFIX,
  classifySummaryLength,
  classifyTitleLength,
  collapseWhitespace,
  renderedTitle,
  truncateForSerp,
  validateForPublish,
} from '@/components/admin/ArticleMetadataForm'
import {
  ALT_MIN_LENGTH,
  buildImageSnippet,
  classifyAltText,
  fileNameToText,
} from '@/components/admin/ImageUploadButton'

describe('normaliseTags', () => {
  test('lowercases so eclipse and Eclipse stop being two hubs', () => {
    expect(normaliseTags(['Eclipse'])).toEqual(['eclipse'])
    expect(normaliseTags(['Saturno', 'saturno'])).toEqual(['saturno'])
  })

  // Accents are PRESERVED. The stored tag is display text rendered to Spanish
  // readers by components/Tag.js, so 'bolido' for 'bólido' would be a visible
  // misspelling. De-accenting belongs in the URL slug layer, not the stored value.
  test('preserves accents, because the stored tag is display text', () => {
    expect(normaliseTags(['astronomía'])).toEqual(['astronomía'])
    expect(normaliseTags(['Observación', 'Niño', 'Pingüino'])).toEqual([
      'observación',
      'niño',
      'pingüino',
    ])
  })

  test('trims and collapses internal whitespace', () => {
    expect(normaliseTags(['  luna  llena  '])).toEqual(['luna llena'])
    expect(normaliseTags(['lluvia\tde\nestrellas'])).toEqual(['lluvia de estrellas'])
  })

  test('de-duplicates after normalising, keeping first-seen order', () => {
    expect(normaliseTags(['Eclipse', 'eclipse', ' ECLIPSE '])).toEqual(['eclipse'])
    expect(normaliseTags(['luna', 'Marte', 'LUNA'])).toEqual(['luna', 'marte'])
  })

  test('drops empty and whitespace-only entries', () => {
    expect(normaliseTags(['', '   ', 'cometa', '\n'])).toEqual(['cometa'])
  })

  test('handles a missing, null or non-array value', () => {
    expect(normaliseTags(undefined)).toEqual([])
    expect(normaliseTags(null)).toEqual([])
    expect(normaliseTags('Eclipse')).toEqual(['eclipse'])
  })

  test('ignores values that are not text', () => {
    expect(normaliseTags([{}, [], true, null, 'jwst'])).toEqual(['jwst'])
  })

  test('does NOT merge singular and plural forms', () => {
    // Merging meteoro/meteoros is a content decision, not a code one.
    expect(normaliseTags(['meteoro', 'meteoros', 'meteorito'])).toEqual([
      'meteoro',
      'meteoros',
      'meteorito',
    ])
  })
})

describe('collapseWhitespace', () => {
  test('removes the stray sequence that renders literally in the SERP', () => {
    expect(collapseWhitespace('Eclipse solar ;  parcial')).toBe('Eclipse solar ; parcial')
  })

  test('trims the ends and collapses newlines and tabs', () => {
    expect(collapseWhitespace('  Luna\n\nllena\t2026  ')).toBe('Luna llena 2026')
  })

  test('returns an empty string for a non-text value', () => {
    expect(collapseWhitespace(undefined)).toBe('')
    expect(collapseWhitespace(null)).toBe('')
    expect(collapseWhitespace(42)).toBe('')
  })
})

describe('classifyTitleLength', () => {
  test('reserves room for the site-name suffix the layout appends', () => {
    expect(TITLE_SUFFIX).toBe(' | SAC')
    expect(TITLE_LIMIT).toBe(SERP_TITLE_MAX - TITLE_SUFFIX.length)
    expect(TITLE_LIMIT).toBe(54)
  })

  test('reports empty for a missing title', () => {
    expect(classifyTitleLength('')).toMatchObject({ count: 0, rendered: 0, status: 'empty' })
    expect(classifyTitleLength(undefined).status).toBe('empty')
  })

  test('accepts a title at exactly the limit', () => {
    const title = 'a'.repeat(TITLE_LIMIT)
    expect(classifyTitleLength(title)).toMatchObject({
      count: TITLE_LIMIT,
      rendered: SERP_TITLE_MAX,
      status: 'ok',
    })
  })

  test('warns one character past the limit', () => {
    const result = classifyTitleLength('a'.repeat(TITLE_LIMIT + 1))
    expect(result.status).toBe('warning')
    expect(result.rendered).toBe(SERP_TITLE_MAX + 1)
  })

  test('counts the collapsed title, not the padding around it', () => {
    expect(classifyTitleLength('  Cometa   Leonard  ').count).toBe('Cometa Leonard'.length)
  })
})

describe('classifySummaryLength', () => {
  test('reports empty for a missing summary', () => {
    expect(classifySummaryLength('')).toEqual({ count: 0, status: 'empty' })
    expect(classifySummaryLength(undefined).status).toBe('empty')
  })

  test('reports short below the green band', () => {
    expect(classifySummaryLength('a'.repeat(69)).status).toBe('short')
    expect(classifySummaryLength('a'.repeat(SUMMARY_MIN_GOOD - 1)).status).toBe('short')
  })

  test('reports good inside the green band, both edges included', () => {
    expect(classifySummaryLength('a'.repeat(SUMMARY_MIN_GOOD)).status).toBe('good')
    expect(classifySummaryLength('a'.repeat(SUMMARY_MAX_GOOD)).status).toBe('good')
  })

  test('reports ok between the green band and the warning threshold', () => {
    expect(classifySummaryLength('a'.repeat(SUMMARY_MAX_GOOD + 1)).status).toBe('ok')
    expect(classifySummaryLength('a'.repeat(SUMMARY_MAX)).status).toBe('ok')
  })

  test('warns above the threshold', () => {
    expect(classifySummaryLength('a'.repeat(SUMMARY_MAX + 1)).status).toBe('warning')
    expect(classifySummaryLength('a'.repeat(296)).status).toBe('warning')
  })
})

describe('renderedTitle', () => {
  test('appends the suffix the root layout template adds', () => {
    expect(renderedTitle('Cometa Leonard')).toBe('Cometa Leonard | SAC')
  })

  test('collapses whitespace before appending', () => {
    expect(renderedTitle('  Cometa   Leonard ')).toBe('Cometa Leonard | SAC')
  })

  test('falls back to the site name when there is no title', () => {
    expect(renderedTitle('')).not.toContain('undefined')
    expect(renderedTitle('')).not.toMatch(/^ \| /)
  })
})

describe('truncateForSerp', () => {
  test('leaves text at or below the limit untouched', () => {
    expect(truncateForSerp('Cometa Leonard', 60)).toBe('Cometa Leonard')
  })

  test('cuts at a word boundary and adds an ellipsis', () => {
    const result = truncateForSerp(
      'Observacion de la lluvia de meteoros Perseidas desde Puerto',
      40
    )
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(41)
    expect(result).toBe('Observacion de la lluvia de meteoros…')
  })

  test('does not leave dangling punctuation before the ellipsis', () => {
    expect(truncateForSerp('Eclipse total de Luna, visible desde Puerto Rico', 22)).toBe(
      'Eclipse total de Luna…'
    )
  })

  test('cuts mid-word when there is no usable word boundary', () => {
    expect(truncateForSerp('a'.repeat(50), 10)).toBe(`${'a'.repeat(10)}…`)
  })
})

describe('validateForPublish', () => {
  test('blocks publishing an article with no tags', () => {
    expect(validateForPublish({ tags: [] })).toBe(MISSING_TAGS_MESSAGE)
    expect(validateForPublish({})).toBe(MISSING_TAGS_MESSAGE)
    expect(validateForPublish(null)).toBe(MISSING_TAGS_MESSAGE)
  })

  test('allows publishing once there is at least one tag', () => {
    expect(validateForPublish({ tags: ['eclipse'] })).toBeNull()
  })

  test('the message is in Spanish and names the fix', () => {
    expect(MISSING_TAGS_MESSAGE).toMatch(/etiqueta/i)
    expect(MISSING_TAGS_MESSAGE).toMatch(/publicar/i)
  })
})

describe('fileNameToText', () => {
  test('drops the extension and turns separators into spaces', () => {
    expect(fileNameToText('luna_llena-2026.jpg')).toBe('luna llena 2026')
  })

  test('returns an empty string for a missing name', () => {
    expect(fileNameToText(undefined)).toBe('')
  })
})

describe('classifyAltText', () => {
  test('reports empty when the editor typed nothing', () => {
    expect(classifyAltText('', 'pano1.jpg')).toEqual({ count: 0, status: 'empty' })
    expect(classifyAltText('   ', 'pano1.jpg').status).toBe('empty')
  })

  test('flags alt text that is still the file name', () => {
    expect(classifyAltText('pano1.jpg', 'pano1.jpg').status).toBe('filename')
    expect(classifyAltText('pano1', 'pano1.jpg').status).toBe('filename')
    expect(classifyAltText('luna llena 2026', 'luna_llena-2026.jpg').status).toBe('filename')
  })

  test('warns below the minimum length', () => {
    // The three worst live values: 'pano1', '63718', 'LRO'.
    expect(classifyAltText('63718', 'IMG_0001.jpg').status).toBe('short')
    expect(classifyAltText('LRO', 'IMG_0001.jpg').status).toBe('short')
    expect(classifyAltText('a'.repeat(ALT_MIN_LENGTH - 1), 'IMG_0001.jpg').status).toBe('short')
  })

  test('accepts descriptive alt text at or above the minimum', () => {
    expect(classifyAltText('a'.repeat(ALT_MIN_LENGTH), 'IMG_0001.jpg').status).toBe('ok')
    const alt = 'Luna llena sobre el Observatorio de Arecibo'
    expect(classifyAltText(alt, 'IMG_0001.jpg')).toEqual({ count: alt.length, status: 'ok' })
  })
})

describe('buildImageSnippet', () => {
  test('keeps alt and caption independent', () => {
    const snippet = buildImageSnippet('https://s3/x.jpg', 800, 600, 'Luna llena', 'Foto: SAC')
    expect(snippet).toContain('alt="Luna llena"')
    expect(snippet).toContain('<ImageCaption>Foto: SAC</ImageCaption>')
  })

  test('omits the caption element when the caption is empty', () => {
    const snippet = buildImageSnippet('https://s3/x.jpg', 800, 600, 'Luna llena', '')
    expect(snippet).toContain('alt="Luna llena"')
    expect(snippet).not.toContain('ImageCaption')
  })

  test('still reuses the alt text when no caption argument is given', () => {
    // components/admin/ArticleEditor.js calls this with four arguments on drop.
    const snippet = buildImageSnippet('https://s3/x.jpg', 800, 600, 'Luna llena')
    expect(snippet).toContain('<ImageCaption>Luna llena</ImageCaption>')
  })

  test('escapes a double quote so the MDX attribute stays valid', () => {
    const snippet = buildImageSnippet('https://s3/x.jpg', 800, 600, 'Nebulosa "Roseta"', '')
    expect(snippet).toContain('alt="Nebulosa &quot;Roseta&quot;"')
  })
})
