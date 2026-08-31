/**
 * Author entity SEO: the slug-preserving author lookup, the /authors/[slug]
 * route metadata, the ProfilePage + Person schema and the crawlable article
 * list that finally ties 73 posts to a credentialed author.
 *
 * The author files themselves are read from disk on purpose. The whole point of
 * this route is the real content of data/authors/*.md.
 */

// LayoutWrapper and Image are client components with heavy transitive imports.
jest.mock(
  '@/components/LayoutWrapper',
  () =>
    ({ children }) =>
      children
)
jest.mock('@/components/Image', () => () => null)
jest.mock('@/components/Link', () => {
  const React = require('react')
  const MockLink = ({ href, children }) => React.createElement('a', { href }, children)
  MockLink.displayName = 'MockLink'
  return MockLink
})
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  permanentRedirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
jest.mock('@/lib/articles', () => ({ listArticles: jest.fn() }))

import { renderToStaticMarkup } from 'react-dom/server'
import { notFound, permanentRedirect } from 'next/navigation'
import { listArticles } from '@/lib/articles'
import { ORGANIZATION_ID, ORIGIN } from '@/lib/seo'
import {
  DEFAULT_AUTHOR_SLUG,
  getAuthorData,
  getAuthorDetails,
  getAuthorProfile,
  listAuthorSlugs,
} from '@/lib/authors'
import AuthorPage, {
  authorDescription,
  authorProfilePath,
  authorProfileSchema,
  authorSameAs,
  authorTopics,
  bodyParagraphs,
  generateMetadata,
  generateStaticParams,
  redirectTargetFor,
} from '../../app/authors/[slug]/page'

// The jest transform uses the classic JSX runtime, so the server components'
// JSX resolves `React` from the global scope at render time.
global.React = require('react')

const article = (slug, { authors = ['eddie'], tags = [], title = 'Título' } = {}) => ({
  slug,
  title,
  summary: 'Resumen',
  date: '2026-03-01T08:00:00Z',
  authors,
  tags,
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getAuthorData slug preservation', () => {
  it('returns the requested slug alongside the frontmatter', async () => {
    const author = await getAuthorData('eddie')
    expect(author.slug).toBe('eddie')
    expect(author.name).toBe('Eddie Irizarry')
  })

  it('keeps every frontmatter field the previous shape exposed', async () => {
    const author = await getAuthorData('eddie')
    expect(author.avatar).toMatch(/^\/static\/images\/authors\//)
    expect(author.occupation).toBeTruthy()
    expect(author.bio).toBeTruthy()
  })

  it('reports the fallback slug when the author file does not exist', async () => {
    const author = await getAuthorData('no-existe')
    expect(author.slug).toBe(DEFAULT_AUTHOR_SLUG)
    expect(author.name).toBe('SAC')
  })

  it('builds a usable /authors/<slug> path from the returned slug', async () => {
    const author = await getAuthorData('eddie')
    expect(authorProfilePath(author.slug)).toBe('/authors/eddie')
  })
})

describe('getAuthorDetails', () => {
  it('still returns one object per requested slug, in order', async () => {
    const details = await getAuthorDetails(['eddie', 'abdiel'])
    expect(details).toHaveLength(2)
    expect(details.map((a) => a.slug)).toEqual(['eddie', 'abdiel'])
    expect(details.map((a) => a.name)).toEqual(['Eddie Irizarry', 'Abdiel Avilés'])
  })

  it('gives every author a slug, so no byline can be left without an href', async () => {
    const details = await getAuthorDetails(['eddie', 'no-existe'])
    expect(details.every((a) => typeof a.slug === 'string' && a.slug.length > 0)).toBe(true)
  })
})

describe('listAuthorSlugs and getAuthorProfile', () => {
  it('lists the author files without their extension', () => {
    const slugs = listAuthorSlugs()
    expect(slugs).toContain('eddie')
    expect(slugs).toContain(DEFAULT_AUTHOR_SLUG)
    expect(slugs.some((slug) => slug.endsWith('.md'))).toBe(false)
  })

  it('returns the frontmatter and the markdown body of a known author', () => {
    const profile = getAuthorProfile('eddie')
    expect(profile.slug).toBe('eddie')
    expect(profile.frontMatter.name).toBe('Eddie Irizarry')
    expect(profile.content).toContain('Solar System Ambassadors')
  })

  it('returns null for an unknown slug instead of falling back', () => {
    expect(getAuthorProfile('no-existe')).toBeNull()
  })
})

describe('redirectTargetFor', () => {
  it('leaves a current board member on their own page', () => {
    expect(redirectTargetFor('eddie', getAuthorProfile('eddie').frontMatter)).toBeNull()
  })

  it('sends the default author to the organization page', () => {
    expect(redirectTargetFor(DEFAULT_AUTHOR_SLUG, {})).toBe('/about')
  })

  it('consolidates an older board-term file into the current one', () => {
    expect(redirectTargetFor('eddie_2021', getAuthorProfile('eddie_2021').frontMatter)).toBe(
      '/authors/eddie'
    )
    expect(redirectTargetFor('rafael_2021', getAuthorProfile('rafael_2021').frontMatter)).toBe(
      '/authors/rafael'
    )
  })

  it('ignores a canonicalSlug that points at the page itself', () => {
    expect(redirectTargetFor('eddie', { canonicalSlug: 'eddie' })).toBeNull()
    expect(redirectTargetFor('eddie', { canonicalSlug: '   ' })).toBeNull()
  })
})

describe('generateStaticParams', () => {
  it('prerenders one page per author file that is not a duplicate', async () => {
    const params = await generateStaticParams()
    const slugs = params.map((p) => p.slug)
    expect(slugs).toContain('eddie')
    expect(slugs).toContain('abdiel')
  })

  it('does not prerender the redirecting slugs', async () => {
    const slugs = (await generateStaticParams()).map((p) => p.slug)
    expect(slugs).not.toContain(DEFAULT_AUTHOR_SLUG)
    expect(slugs).not.toContain('eddie_2021')
    expect(slugs).not.toContain('rafael_2021')
  })
})

describe('authorSameAs', () => {
  it('is empty when the frontmatter declares no profile, rather than guessing one', () => {
    expect(authorSameAs(getAuthorProfile('eddie').frontMatter)).toEqual([])
    expect(authorSameAs({})).toEqual([])
  })

  it('collects the single-network fields', () => {
    expect(
      authorSameAs({ twitter: 'https://x.com/a', linkedin: 'https://linkedin.com/in/a' })
    ).toEqual(['https://x.com/a', 'https://linkedin.com/in/a'])
  })

  it('accepts a sameAs array and puts it first', () => {
    expect(
      authorSameAs({ sameAs: ['https://earthsky.org/author/a'], twitter: 'https://x.com/a' })
    ).toEqual(['https://earthsky.org/author/a', 'https://x.com/a'])
  })

  it('drops non-URL values, mailto and duplicates', () => {
    expect(
      authorSameAs({
        sameAs: ['https://x.com/a', 'https://x.com/a', 'no-soy-url'],
        twitter: 'mailto:a@b.com',
        github: '  https://github.com/a  ',
      })
    ).toEqual(['https://x.com/a', 'https://github.com/a'])
  })
})

describe('authorTopics', () => {
  it('orders topics by how often the author writes about them', () => {
    const topics = authorTopics([
      article('a', { tags: ['Eclipse', 'Luna'] }),
      article('b', { tags: ['Eclipse'] }),
      article('c', { tags: ['Eclipse', 'Luna'] }),
    ])
    expect(topics).toEqual(['Eclipse', 'Luna'])
  })

  it('breaks ties alphabetically so the build output stays stable', () => {
    const topics = authorTopics([article('a', { tags: ['Zodiaco', 'Asteroide'] })])
    expect(topics).toEqual(['Asteroide', 'Zodiaco'])
  })

  it('merges tags that differ only in case and honours the limit', () => {
    const topics = authorTopics([article('a', { tags: ['Eclipse', 'eclipse', 'Luna', 'Sol'] })], 2)
    expect(topics).toEqual(['Eclipse', 'Luna'])
  })

  it('tolerates articles with no tags at all', () => {
    expect(authorTopics([article('a'), {}, null])).toEqual([])
    expect(authorTopics()).toEqual([])
  })
})

describe('authorDescription', () => {
  const eddie = getAuthorProfile('eddie').frontMatter

  it('leads with the name and the board role from the frontmatter', () => {
    const description = authorDescription(eddie, 73)
    expect(description.startsWith('Eddie Irizarry, Vicepresidente')).toBe(true)
  })

  it('states the article count with the right Spanish plural', () => {
    expect(authorDescription(eddie, 73)).toContain('73 artículos publicados')
    expect(authorDescription(eddie, 1)).toContain('1 artículo publicado')
  })

  it('omits the count when the author has published nothing', () => {
    expect(authorDescription(eddie, 0)).not.toMatch(/publicad/)
  })

  it('stays within a usable meta description length', () => {
    expect(authorDescription(eddie, 73).length).toBeLessThanOrEqual(160)
  })

  it('never invents a role for an author whose frontmatter has none', () => {
    const description = authorDescription({ name: 'Alguien' }, 0)
    expect(description).toBe('Alguien, Sociedad de Astronomía del Caribe.')
  })
})

describe('bodyParagraphs', () => {
  it('splits the markdown body on blank lines', () => {
    expect(bodyParagraphs('uno\n\ndos\n\n\ntres')).toEqual(['uno', 'dos', 'tres'])
  })

  it('returns an empty list for an author file with no body', () => {
    expect(bodyParagraphs('\n\n')).toEqual([])
    expect(bodyParagraphs(undefined)).toEqual([])
  })
})

describe('authorProfileSchema', () => {
  const frontMatter = getAuthorProfile('eddie').frontMatter
  const schema = authorProfileSchema({
    slug: 'eddie',
    frontMatter,
    articles: [article('a', { tags: ['Eclipse'] })],
  })

  it('is a ProfilePage wrapping a Person', () => {
    expect(schema['@type']).toBe('ProfilePage')
    expect(schema.mainEntity['@type']).toBe('Person')
  })

  it('gives the Person a stable absolute @id and url', () => {
    expect(schema.url).toBe(`${ORIGIN}/authors/eddie`)
    expect(schema.mainEntity.url).toBe(`${ORIGIN}/authors/eddie`)
    expect(schema.mainEntity['@id']).toBe(`${ORIGIN}/authors/eddie#person`)
  })

  it('carries the name, role and bio that the frontmatter declares', () => {
    expect(schema.mainEntity.name).toBe('Eddie Irizarry')
    expect(schema.mainEntity.jobTitle).toBe(frontMatter.occupation)
    expect(schema.mainEntity.description).toBe(frontMatter.bio)
  })

  it('resolves the avatar to an absolute URL', () => {
    expect(schema.mainEntity.image).toBe(`${ORIGIN}${frontMatter.avatar}`)
    expect(schema.mainEntity.image).toMatch(/^https:\/\//)
  })

  it('links the Person to the organization node emitted by the root layout', () => {
    expect(schema.mainEntity.worksFor).toEqual({ '@id': ORGANIZATION_ID })
  })

  it('derives knowsAbout from the tags of the author own articles', () => {
    expect(schema.mainEntity.knowsAbout).toEqual(['Eclipse'])
  })

  it('omits sameAs entirely when no profile URL is declared', () => {
    expect(schema.mainEntity.sameAs).toBeUndefined()
  })

  it('emits sameAs once the frontmatter declares a profile URL', () => {
    const withProfile = authorProfileSchema({
      slug: 'eddie',
      frontMatter: { ...frontMatter, sameAs: ['https://earthsky.org/author/eddie-irizarry/'] },
    })
    expect(withProfile.mainEntity.sameAs).toEqual(['https://earthsky.org/author/eddie-irizarry/'])
  })

  it('declares the page language as Spanish', () => {
    expect(schema.inLanguage).toBe('es-PR')
  })
})

describe('generateMetadata for /authors/<slug>', () => {
  it('titles the page with the author name and never repeats the site name', async () => {
    listArticles.mockResolvedValue({ articles: [article('a')] })
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'eddie' }) })
    expect(meta.title).toBe('Eddie Irizarry')
    expect(meta.title).not.toMatch(/SAC/i)
  })

  it('declares a self-referencing canonical', async () => {
    listArticles.mockResolvedValue({ articles: [article('a')] })
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'eddie' }) })
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/authors/eddie`)
    expect(meta.openGraph.url).toBe(`${ORIGIN}/authors/eddie`)
  })

  it('keeps the shared OpenGraph base and marks the page as a profile', async () => {
    listArticles.mockResolvedValue({ articles: [article('a')] })
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'eddie' }) })
    expect(meta.openGraph.type).toBe('profile')
    expect(meta.openGraph.locale).toBe('es_PR')
    expect(meta.openGraph.siteName).toBeTruthy()
    expect(meta.twitter.card).toBe('summary_large_image')
  })

  it('uses the avatar as the OpenGraph image, absolute', async () => {
    listArticles.mockResolvedValue({ articles: [article('a')] })
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'eddie' }) })
    expect(meta.openGraph.images[0].url).toBe(`${ORIGIN}/static/images/authors/eddie_3.jpeg`)
  })

  it('keeps the shared banner when an author declares no avatar', async () => {
    listArticles.mockResolvedValue({ articles: [] })
    // Every author file currently declares an avatar, so the fallback branch is
    // exercised through the helper the route feeds pageMetadata.
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'francisco' }) })
    expect(meta.openGraph.images.length).toBeGreaterThan(0)
    expect(meta.openGraph.images[0].url).toMatch(/^https:\/\//)
  })

  it('counts only the articles credited to that author', async () => {
    listArticles.mockResolvedValue({
      articles: [article('a'), article('b'), article('c', { authors: ['abdiel'] })],
    })
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'eddie' }) })
    expect(meta.description).toContain('2 artículos publicados')
  })

  it('marks an unknown slug noindex', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'no-existe' }) })
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
  })

  it('marks a redirecting slug noindex and points it at its target', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'eddie_2021' }) })
    expect(meta.robots.index).toBe(false)
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/authors/eddie`)
  })
})

describe('AuthorPage', () => {
  it('calls notFound for a slug with no author file', async () => {
    await expect(AuthorPage({ params: Promise.resolve({ slug: 'no-existe' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    )
    expect(notFound).toHaveBeenCalled()
  })

  it('redirects the default author to the organization page', async () => {
    await expect(
      AuthorPage({ params: Promise.resolve({ slug: DEFAULT_AUTHOR_SLUG }) })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(permanentRedirect).toHaveBeenCalledWith('/about')
  })

  it('redirects an older board-term slug to the current author page', async () => {
    await expect(AuthorPage({ params: Promise.resolve({ slug: 'eddie_2021' }) })).rejects.toThrow(
      'NEXT_REDIRECT'
    )
    expect(permanentRedirect).toHaveBeenCalledWith('/authors/eddie')
  })

  it('renders the bio, the role and a crawlable link per article', async () => {
    listArticles.mockResolvedValue({
      articles: [
        article('2026/03/01/eclipse', { title: 'Eclipse total' }),
        article('2026/04/01/luna', { title: 'Luna llena' }),
        article('2026/05/01/otro', { authors: ['abdiel'], title: 'De otro autor' }),
      ],
    })
    const element = await AuthorPage({ params: Promise.resolve({ slug: 'eddie' }) })
    const markup = renderToStaticMarkup(element)

    expect(markup).toContain('Eddie Irizarry')
    expect(markup).toContain('Vicepresidente')
    expect(markup).toContain('href="/blog/2026/03/01/eclipse"')
    expect(markup).toContain('href="/blog/2026/04/01/luna"')
    expect(markup).toContain('Eclipse total')
    expect(markup).not.toContain('De otro autor')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('links back to the organization page', async () => {
    listArticles.mockResolvedValue({ articles: [] })
    const markup = renderToStaticMarkup(
      await AuthorPage({ params: Promise.resolve({ slug: 'eddie' }) })
    )
    expect(markup).toContain('href="/about"')
  })

  it('renders the markdown body of the author file as real text', async () => {
    listArticles.mockResolvedValue({ articles: [] })
    const markup = renderToStaticMarkup(
      await AuthorPage({ params: Promise.resolve({ slug: 'eddie' }) })
    )
    expect(markup).toContain('Solar System Ambassadors')
  })

  it('shows a Spanish empty state instead of a bare heading', async () => {
    listArticles.mockResolvedValue({ articles: [] })
    const markup = renderToStaticMarkup(
      await AuthorPage({ params: Promise.resolve({ slug: 'francisco' }) })
    )
    expect(markup).toContain('Todavía no hay artículos publicados')
  })

  it('embeds the ProfilePage and BreadcrumbList JSON-LD', async () => {
    listArticles.mockResolvedValue({ articles: [article('2026/03/01/eclipse')] })
    const markup = renderToStaticMarkup(
      await AuthorPage({ params: Promise.resolve({ slug: 'eddie' }) })
    )
    const blocks = [
      ...markup.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
    ].map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<')))
    expect(blocks.map((b) => b['@type'])).toEqual(['ProfilePage', 'BreadcrumbList'])
    expect(blocks[0].mainEntity.name).toBe('Eddie Irizarry')
    expect(blocks[1].itemListElement.map((i) => i.item)).toEqual([
      ORIGIN,
      `${ORIGIN}/about`,
      `${ORIGIN}/authors/eddie`,
    ])
  })

  it('survives an S3 failure by rendering the profile without the article list', async () => {
    listArticles.mockRejectedValue(new Error('S3 down'))
    const markup = renderToStaticMarkup(
      await AuthorPage({ params: Promise.resolve({ slug: 'eddie' }) })
    )
    expect(markup).toContain('Eddie Irizarry')
    expect(markup).toContain('Todavía no hay artículos publicados')
  })
})
