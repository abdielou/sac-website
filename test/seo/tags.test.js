/**
 * Tag route SEO: de-kebab display titles, canonical metadata, no phantom RSS
 * alternate, and no soft 404 for an unknown tag.
 */

// `@/layouts/*` has no jest moduleNameMapper entry, so the layout is mocked
// virtually. The other mocks keep the page modules free of the S3 client and
// of client-only components.
jest.mock('@/layouts/ListLayout', () => () => null, { virtual: true })
jest.mock(
  '@/components/LayoutWrapper',
  () =>
    ({ children }) =>
      children,
  { virtual: true }
)
jest.mock('@/components/Link', () => () => null, { virtual: true })
jest.mock('@/components/Tag', () => () => null, { virtual: true })
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
jest.mock('@/lib/articles', () => ({ listArticles: jest.fn() }))

import { notFound } from 'next/navigation'
import { listArticles } from '@/lib/articles'
import { ORIGIN } from '@/lib/seo'
import TagPage, { tagDisplayTitle, generateMetadata } from '../../app/tags/[tag]/page'
import { metadata as tagsIndexMetadata } from '../../app/tags/page'

// The jest transform uses the classic JSX runtime, so the server components'
// JSX resolves `React` from the global scope at render time.
global.React = require('react')

const article = (title, tags) => ({ title, tags, slug: '2026/01/01/x', summary: '', date: '' })

beforeEach(() => {
  jest.clearAllMocks()
})

describe('tagDisplayTitle', () => {
  it('capitalises a single-word tag', () => {
    expect(tagDisplayTitle('eclipse')).toBe('Eclipse')
  })

  it('de-kebabs a multi-word tag into spaced words', () => {
    // Spanish sentence case: only the first word is capitalised.
    expect(tagDisplayTitle('lluvia-de-meteoros')).toBe('Lluvia de meteoros')
  })

  it('keeps accented characters and capitalises an accented first letter', () => {
    expect(tagDisplayTitle('astronomía-solar')).toBe('Astronomía solar')
    expect(tagDisplayTitle('ñandú')).toBe('Ñandú')
    expect(tagDisplayTitle('fotografía-astronómica')).toBe('Fotografía astronómica')
  })

  it('never leaves a hyphen in the output', () => {
    expect(tagDisplayTitle('niños-y-niñas')).not.toContain('-')
  })

  it('does not drop the second character of the first word', () => {
    // The old implementation produced 'Luna-llena'.slice(1) style truncation.
    expect(tagDisplayTitle('luna-llena')).toBe('Luna llena')
  })

  it('tolerates an empty, undefined or hyphen-only tag', () => {
    expect(tagDisplayTitle('')).toBe('')
    expect(tagDisplayTitle(undefined)).toBe('')
    expect(tagDisplayTitle(null)).toBe('')
    expect(tagDisplayTitle('---')).toBe('')
  })

  it('collapses repeated separators instead of emitting blank words', () => {
    expect(tagDisplayTitle('luna--llena')).toBe('Luna llena')
  })
})

describe('tags index metadata', () => {
  it('uses a Spanish title that does not repeat the site name', () => {
    expect(tagsIndexMetadata.title).toBe('Temas')
    expect(tagsIndexMetadata.title).not.toMatch(/SAC/i)
    expect(tagsIndexMetadata.title).not.toMatch(/tags/i)
  })

  it('drops the starter-template English description', () => {
    expect(tagsIndexMetadata.description).not.toBe('Things I blog about')
    expect(tagsIndexMetadata.description).toMatch(/temas/i)
  })

  it('declares a self-referencing canonical', () => {
    expect(tagsIndexMetadata.alternates.canonical).toBe(`${ORIGIN}/tags`)
  })

  it('carries a complete OpenGraph block from the shared base', () => {
    expect(tagsIndexMetadata.openGraph.url).toBe(`${ORIGIN}/tags`)
    expect(tagsIndexMetadata.openGraph.locale).toBe('es_PR')
    expect(tagsIndexMetadata.openGraph.images.length).toBeGreaterThan(0)
    expect(tagsIndexMetadata.twitter.card).toBe('summary_large_image')
  })
})

describe('generateMetadata for /tags/<tag>', () => {
  const params = Promise.resolve({ tag: 'lluvia-de-meteoros' })

  it('uses the de-kebabed Spanish title, never the raw slug', async () => {
    listArticles.mockResolvedValue({
      articles: [article('a', ['Lluvia de meteoros']), article('b', ['Lluvia de meteoros'])],
    })
    const meta = await generateMetadata({ params })
    expect(meta.title).toBe('Artículos sobre Lluvia de meteoros')
    expect(meta.title).not.toContain('lluvia-de-meteoros')
    expect(meta.title).not.toMatch(/SAC/i)
  })

  it('writes a Spanish description that includes the article count', async () => {
    listArticles.mockResolvedValue({
      articles: [article('a', ['Lluvia de meteoros']), article('b', ['Lluvia de meteoros'])],
    })
    const meta = await generateMetadata({ params })
    expect(meta.description).toContain('2 artículos')
    expect(meta.description).not.toMatch(/\btags?\b/i)
  })

  it('uses the singular noun for one article', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Lluvia de meteoros'])] })
    const meta = await generateMetadata({ params })
    expect(meta.description).toContain('1 artículo ')
  })

  it('sets a canonical of /tags/<tag>', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Lluvia de meteoros'])] })
    const meta = await generateMetadata({ params })
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/tags/lluvia-de-meteoros`)
    expect(meta.openGraph.url).toBe(`${ORIGIN}/tags/lluvia-de-meteoros`)
  })

  it('advertises no RSS alternate, because /tags/<tag>/feed.xml does not exist', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Lluvia de meteoros'])] })
    const meta = await generateMetadata({ params })
    expect(meta.alternates.types).toBeUndefined()
    expect(JSON.stringify(meta)).not.toContain('feed.xml')
  })

  it('marks an unknown tag noindex', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Eclipse'])] })
    const meta = await generateMetadata({ params: Promise.resolve({ tag: 'no-existe' }) })
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
  })
})

describe('TagPage soft 404', () => {
  it('calls notFound when no published article carries the tag', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Eclipse'])] })
    await expect(TagPage({ params: Promise.resolve({ tag: 'no-existe' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    )
    expect(notFound).toHaveBeenCalled()
  })

  it('renders the list and does not call notFound when the tag has articles', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Eclipse'])] })
    const element = await TagPage({ params: Promise.resolve({ tag: 'eclipse' }) })
    expect(element).toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })

  it('passes the Spanish page title down to ListLayout', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Eclipse'])] })
    const element = await TagPage({ params: Promise.resolve({ tag: 'eclipse' }) })
    const list = findByProp(element, 'posts')
    expect(list).not.toBeNull()
    expect(list.props.title).toBe('Artículos sobre Eclipse')
    expect(list.props.posts).toHaveLength(1)
  })

  it('renders a breadcrumb trail back to the tag index', async () => {
    listArticles.mockResolvedValue({ articles: [article('a', ['Eclipse'])] })
    const element = await TagPage({ params: Promise.resolve({ tag: 'eclipse' }) })
    const nav = findByProp(element, 'aria-label')
    expect(nav).not.toBeNull()
    expect(nav.props['aria-label']).toBe('Ruta de navegación')
  })
})

/**
 * Find the first element in a React tree carrying a given prop.
 *
 * Asserting on a fixed child path broke the moment a breadcrumb and a JSON-LD
 * script were added around ListLayout, which told us nothing useful about the
 * behaviour under test.
 */
function findByProp(node, prop) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByProp(child, prop)
      if (hit) return hit
    }
    return null
  }
  if (node.props && Object.prototype.hasOwnProperty.call(node.props, prop)) return node
  return node.props ? findByProp(node.props.children, prop) : null
}
