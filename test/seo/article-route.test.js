/**
 * Article route SEO regression tests.
 *
 * The route module pulls in S3, MDX and the React tree, none of which belong in
 * a unit test, so every heavy dependency is mocked and only the SEO surface is
 * exercised: the related-article scoring and the metadata export.
 */
import { ORIGIN } from '@/lib/seo'

jest.mock('next/navigation', () => ({ notFound: jest.fn() }))
jest.mock('@/lib/mdx-renderer', () => ({ extractToc: jest.fn(() => []) }))
jest.mock('@/components/LayoutWrapper', () => ({ __esModule: true, default: () => null }))
jest.mock('../../app/blog/[...slug]/BlogPost', () => ({ __esModule: true, default: () => null }))

jest.mock('@/lib/articles', () => ({
  getArticle: jest.fn(),
  listArticles: jest.fn(async () => ({ articles: [] })),
}))

jest.mock('@/lib/authors', () => ({
  getAuthorDetails: jest.fn(async (slugs) => slugs.map((slug) => ({ name: `Autor ${slug}` }))),
}))

const { getArticle } = require('@/lib/articles')
const {
  generateMetadata,
  selectRelatedArticles,
  RELATED_ARTICLE_LIMIT,
} = require('../../app/blog/[...slug]/page')

const article = (overrides = {}) => ({
  slug: '2026/08/23/luna-llena',
  title: 'La luna llena de agosto',
  summary: 'Cómo observar la luna llena desde Puerto Rico.',
  date: '2026-08-23T08:00:00Z',
  tags: ['Luna', 'Observación'],
  images: ['/static/images/blog/luna.png'],
  draft: false,
  ...overrides,
})

const metadataFor = (slugStr, value) => {
  getArticle.mockImplementation(async (requested) => {
    if (value instanceof Error) throw value
    expect(requested).toBe(slugStr)
    return value
  })
  return generateMetadata({ params: Promise.resolve({ slug: slugStr.split('/') }) })
}

describe('selectRelatedArticles', () => {
  const current = article({ slug: 'a', tags: ['Luna', 'Eclipse'], date: '2026-08-23T08:00:00Z' })

  it('never returns the current article', () => {
    const related = selectRelatedArticles(current, [current, article({ slug: 'b' })])
    expect(related.map((a) => a.slug)).not.toContain('a')
  })

  it('ranks by the number of shared tags', () => {
    const related = selectRelatedArticles(current, [
      article({ slug: 'one-tag', tags: ['Luna'], date: '2026-08-22T08:00:00Z' }),
      article({ slug: 'two-tags', tags: ['Luna', 'Eclipse'], date: '2020-01-01T08:00:00Z' }),
    ])
    expect(related.map((a) => a.slug)).toEqual(['two-tags', 'one-tag'])
  })

  it('matches tags after kebab-casing, so accents and case do not split a tag', () => {
    const accented = article({ slug: 'b', tags: ['LUNA'], date: '2026-08-20T08:00:00Z' })
    expect(selectRelatedArticles(current, [accented]).map((a) => a.slug)).toEqual(['b'])

    const spaced = article({ slug: 'c', tags: ['luna llena'] })
    const spacedCurrent = article({ slug: 'a', tags: ['Luna Llena'] })
    expect(selectRelatedArticles(spacedCurrent, [spaced]).map((a) => a.slug)).toEqual(['c'])
  })

  it('drops articles that share no tag', () => {
    const unrelated = article({ slug: 'b', tags: ['Meteoros'] })
    expect(selectRelatedArticles(current, [unrelated])).toEqual([])
  })

  it('breaks a tag tie on date proximity', () => {
    const related = selectRelatedArticles(current, [
      article({ slug: 'far', tags: ['Luna'], date: '2019-01-01T08:00:00Z' }),
      article({ slug: 'near', tags: ['Luna'], date: '2026-08-21T08:00:00Z' }),
      article({ slug: 'middle', tags: ['Luna'], date: '2025-08-23T08:00:00Z' }),
    ])
    expect(related.map((a) => a.slug)).toEqual(['near', 'middle', 'far'])
  })

  it('returns nothing when the current article has no tags', () => {
    // 13 of the 77 articles are untagged: prev/next stays their only fallback.
    for (const tags of [undefined, [], null]) {
      expect(selectRelatedArticles(article({ tags }), [article({ slug: 'b' })])).toEqual([])
    }
  })

  it('caps the list at four articles', () => {
    const candidates = Array.from({ length: 12 }, (unused, i) =>
      article({ slug: `post-${i}`, tags: ['Luna'], date: `2026-0${(i % 8) + 1}-01T08:00:00Z` })
    )
    expect(RELATED_ARTICLE_LIMIT).toBe(4)
    expect(selectRelatedArticles(current, candidates)).toHaveLength(4)
  })

  it('survives missing tags, missing dates and junk entries', () => {
    const candidates = [
      null,
      undefined,
      { title: 'sin slug', tags: ['Luna'] },
      article({ slug: 'no-tags', tags: undefined }),
      article({ slug: 'no-date', date: undefined, tags: ['Luna'] }),
      article({ slug: 'bad-date', date: 'no es una fecha', tags: ['Luna'] }),
    ]
    const related = selectRelatedArticles(current, candidates)
    expect(related.map((a) => a.slug).sort()).toEqual(['bad-date', 'no-date'])
  })

  it('is stable when everything ties', () => {
    const tied = [
      article({ slug: 'zeta', tags: ['Luna'], date: current.date }),
      article({ slug: 'alfa', tags: ['Luna'], date: current.date }),
    ]
    expect(selectRelatedArticles(current, tied).map((a) => a.slug)).toEqual(['alfa', 'zeta'])
    expect(selectRelatedArticles(current, [...tied].reverse()).map((a) => a.slug)).toEqual([
      'alfa',
      'zeta',
    ])
  })

  it('accepts a non-array article list', () => {
    expect(selectRelatedArticles(current, undefined)).toEqual([])
  })
})

describe('generateMetadata', () => {
  const slugStr = '2026/08/23/luna-llena'

  it('emits a self-referencing canonical', async () => {
    const meta = await metadataFor(slugStr, article())
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/blog/${slugStr}`)
    expect(meta.openGraph.url).toBe(`${ORIGIN}/blog/${slugStr}`)
    expect(meta.alternates.canonical).not.toMatch(/[^:]\/\//)
  })

  it('keeps the shared og:site_name, og:locale and twitter:site', async () => {
    const meta = await metadataFor(slugStr, article())
    expect(meta.openGraph.siteName).toBe('Sociedad de Astronomía del Caribe')
    expect(meta.openGraph.locale).toBe('es_PR')
    expect(meta.twitter.site).toBe('@soc_astrocaribe')
    expect(meta.twitter.card).toBe('summary_large_image')
  })

  it('does not bake the site name into the title, the layout template appends it', async () => {
    const meta = await metadataFor(slugStr, article())
    expect(meta.title).toBe('La luna llena de agosto')
    expect(meta.title).not.toMatch(/SAC/)
  })

  it('marks the page as an article with ISO dates', async () => {
    const meta = await metadataFor(
      slugStr,
      article({ date: '2026-08-23T08:00:00Z', lastmod: '2026-09-01T00:00:00Z' })
    )
    expect(meta.openGraph.type).toBe('article')
    expect(meta.openGraph.publishedTime).toBe('2026-08-23T08:00:00.000Z')
    expect(meta.openGraph.modifiedTime).toBe('2026-09-01T00:00:00.000Z')
  })

  it('never lets modifiedTime precede publishedTime', async () => {
    // The migration left a bare-date lastmod against a T08:00:00Z date.
    const meta = await metadataFor(
      slugStr,
      article({ date: '2026-08-23T08:00:00Z', lastmod: '2026-08-23' })
    )
    expect(new Date(meta.openGraph.modifiedTime) >= new Date(meta.openGraph.publishedTime)).toBe(
      true
    )
  })

  it('makes the images absolute and carries the declared dimensions and alt text', async () => {
    const meta = await metadataFor(
      slugStr,
      article({ images: ['/static/images/blog/luna.png'], imgWidth: 1200, imgHeight: 630 })
    )
    expect(meta.openGraph.images[0]).toEqual({
      url: `${ORIGIN}/static/images/blog/luna.png`,
      alt: 'La luna llena de agosto',
      width: 1200,
      height: 630,
    })
    expect(meta.twitter.images[0]).toBe(`${ORIGIN}/static/images/blog/luna.png`)
  })

  it('omits width and height when the article does not declare them', async () => {
    const meta = await metadataFor(slugStr, article({ imgWidth: null, imgHeight: undefined }))
    expect(meta.openGraph.images[0]).not.toHaveProperty('width')
    expect(meta.openGraph.images[0]).not.toHaveProperty('height')
  })

  it('falls back to the social banner when the article has no image', async () => {
    const meta = await metadataFor(slugStr, article({ images: [] }))
    expect(meta.openGraph.images[0].url).toBe(`${ORIGIN}/static/images/sac-main-short-logo.png`)
  })

  it('carries the authors and tags', async () => {
    const meta = await metadataFor(slugStr, article({ authors: ['abdiel'] }))
    expect(meta.openGraph.authors).toEqual(['Autor abdiel'])
    expect(meta.openGraph.tags).toEqual(['Luna', 'Observación'])
  })

  it('noindexes a draft instead of returning empty metadata', async () => {
    const meta = await metadataFor(slugStr, article({ draft: true }))
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/blog/${slugStr}`)
  })

  it('noindexes when the article cannot be fetched', async () => {
    // A transient S3 failure used to publish a page with the site-wide title
    // and index,follow inherited from the root layout.
    const meta = await metadataFor(slugStr, new Error('S3 unavailable'))
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.googleBot.index).toBe(false)
    expect(meta.title).toBe('Artículo no disponible')
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/blog/${slugStr}`)
  })

  it('falls back to the site description when the article has no summary', async () => {
    const meta = await metadataFor(slugStr, article({ summary: '' }))
    expect(meta.description).toMatch(/organización sin fines de lucro/)
  })
})
