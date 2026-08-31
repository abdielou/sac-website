import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import LayoutWrapper from '@/components/LayoutWrapper'
import { listArticles } from '@/lib/articles'
import { DEFAULT_AUTHOR_SLUG, getAuthorProfile, listAuthorSlugs } from '@/lib/authors'
import {
  ORGANIZATION_ID,
  absUrl,
  breadcrumbSchema,
  jsonLdScript,
  noindexMetadata,
  pageMetadata,
} from '@/lib/seo'
import AuthorProfile from './AuthorProfile'

export const dynamicParams = true
export const revalidate = 3600

/** Profile page of the organization itself. The default author is not a person. */
export const ORG_PROFILE_PATH = '/about'

/** Frontmatter fields that may hold a profile URL for schema.org `sameAs`. */
export const SAME_AS_FIELDS = [
  'twitter',
  'linkedin',
  'github',
  'facebook',
  'instagram',
  'youtube',
  'website',
]

export const AUTHOR_TOPIC_LIMIT = 10

const DESCRIPTION_LIMIT = 160
const MISSING_TITLE = 'Autor no disponible'
const MISSING_DESCRIPTION = 'No encontramos el perfil solicitado.'

/** Site-relative path of one author page. */
export function authorProfilePath(slug) {
  return `/authors/${slug}`
}

/**
 * Path this author page consolidates into, or null when it stands on its own.
 *
 * data/authors keeps one file per board term, so the same person owns both
 * `eddie` and `eddie_2021`, with identical name, bio and body text. The
 * `canonicalSlug` frontmatter field points the older file at the current one so
 * the two never compete as duplicates. The shared `default` author is the
 * organization, whose profile page is /about.
 */
export function redirectTargetFor(slug, frontMatter = {}) {
  if (slug === DEFAULT_AUTHOR_SLUG) return ORG_PROFILE_PATH
  const target = frontMatter?.canonicalSlug
  if (typeof target === 'string' && target.trim() && target.trim() !== slug) {
    return authorProfilePath(target.trim())
  }
  return null
}

/** Collapse whitespace and cut on a word boundary, for a meta description. */
function truncate(text, limit) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return `${trimmed.replace(/[.,;:]+$/, '')}…`
}

/**
 * Meta description built only from what the author frontmatter actually holds.
 * No biographical detail is invented: the occupation and bio are copied as is.
 */
export function authorDescription(frontMatter = {}, articleCount = 0) {
  const name = frontMatter.name || MISSING_TITLE
  const parts = [
    frontMatter.occupation
      ? `${name}, ${frontMatter.occupation} de la Sociedad de Astronomía del Caribe.`
      : `${name}, Sociedad de Astronomía del Caribe.`,
  ]
  if (articleCount > 0) {
    const noun = articleCount === 1 ? 'artículo publicado' : 'artículos publicados'
    parts.push(`${articleCount} ${noun}.`)
  }
  if (frontMatter.bio) parts.push(frontMatter.bio)
  return truncate(parts.join(' '), DESCRIPTION_LIMIT)
}

/**
 * Absolute profile URLs declared in the frontmatter, for schema.org `sameAs`.
 * Accepts either a `sameAs` array or one of the single-network fields.
 * Nothing is guessed: an author with no declared profile gets no `sameAs`.
 */
export function authorSameAs(frontMatter = {}) {
  const declared = Array.isArray(frontMatter.sameAs) ? frontMatter.sameAs : []
  const candidates = [...declared, ...SAME_AS_FIELDS.map((field) => frontMatter[field])]
  const seen = new Set()
  const urls = []
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const url = candidate.trim()
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

/**
 * Topics an author demonstrably writes about, taken from the tags of their own
 * published articles. Most frequent first, ties broken alphabetically so the
 * output stays stable between builds.
 */
export function authorTopics(articles = [], limit = AUTHOR_TOPIC_LIMIT) {
  const counts = new Map()
  for (const article of articles) {
    const tags = Array.isArray(article?.tags) ? article.tags : []
    for (const raw of tags) {
      const label = String(raw ?? '').trim()
      if (!label) continue
      const key = label.toLowerCase()
      const entry = counts.get(key)
      if (entry) entry.count += 1
      else counts.set(key, { label, count: 1 })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.label)
}

/**
 * ProfilePage wrapping a Person node.
 *
 * The byline was inert text before this route existed, so nothing tied the 73
 * articles of a NASA Solar System Ambassador to an author entity. The Person
 * carries a stable @id that the Article schema on each post can point at.
 */
export function authorProfileSchema({ slug, frontMatter = {}, articles = [] } = {}) {
  const url = absUrl(authorProfilePath(slug))
  const person = {
    '@type': 'Person',
    '@id': `${url}#person`,
    name: frontMatter.name,
    url,
    worksFor: { '@id': ORGANIZATION_ID },
  }
  if (frontMatter.avatar) person.image = absUrl(frontMatter.avatar)
  if (frontMatter.occupation) person.jobTitle = frontMatter.occupation
  if (frontMatter.bio) person.description = frontMatter.bio

  const sameAs = authorSameAs(frontMatter)
  if (sameAs.length > 0) person.sameAs = sameAs

  const knowsAbout = authorTopics(articles)
  if (knowsAbout.length > 0) person.knowsAbout = knowsAbout

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${url}#profilepage`,
    url,
    name: frontMatter.name,
    inLanguage: 'es-PR',
    mainEntity: person,
  }
}

/** Split a plain markdown body into display paragraphs. */
export function bodyParagraphs(content) {
  return String(content ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * Published articles credited to one author slug, deduplicated per request so
 * generateMetadata and the page body share a single fetch. A transient S3
 * failure degrades to an empty list rather than taking the whole profile down.
 */
const getArticlesByAuthor = cache(async (slug) => {
  try {
    const result = await listArticles({ includeDrafts: false, pageSize: 9999 })

    // Older author files alias onto a current one via `canonicalSlug`, and
    // /authors/<alias> redirects here. Articles still credit the alias string,
    // so match the canonical slug plus every alias that points at it. Without
    // this, a consolidated author's page lists none of their older articles.
    const aliases = new Set([slug])
    for (const candidate of listAuthorSlugs()) {
      if (getAuthorProfile(candidate)?.frontMatter?.canonicalSlug === slug) {
        aliases.add(candidate)
      }
    }

    return (result.articles || []).filter(
      (article) => Array.isArray(article.authors) && article.authors.some((a) => aliases.has(a))
    )
  } catch (error) {
    return []
  }
})

export async function generateStaticParams() {
  return listAuthorSlugs()
    .filter((slug) => !redirectTargetFor(slug, getAuthorProfile(slug)?.frontMatter))
    .map((slug) => ({ slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const path = authorProfilePath(slug)
  const profile = getAuthorProfile(slug)

  if (!profile) {
    return noindexMetadata({ title: MISSING_TITLE, description: MISSING_DESCRIPTION, path })
  }

  // The page body redirects, so this metadata is only ever a transient shell.
  const redirectTarget = redirectTargetFor(slug, profile.frontMatter)
  if (redirectTarget) {
    return noindexMetadata({
      title: profile.frontMatter.name || MISSING_TITLE,
      description: authorDescription(profile.frontMatter),
      path: redirectTarget,
    })
  }

  const articles = await getArticlesByAuthor(slug)

  // Spreading `images: undefined` would erase the shared banner, so the avatar
  // is only added when the frontmatter actually declares one.
  const openGraph = { type: 'profile' }
  if (profile.frontMatter.avatar) {
    openGraph.images = [{ url: absUrl(profile.frontMatter.avatar), alt: profile.frontMatter.name }]
  }

  return pageMetadata({
    title: profile.frontMatter.name || MISSING_TITLE,
    description: authorDescription(profile.frontMatter, articles.length),
    path,
    openGraph,
  })
}

export default async function AuthorPage({ params }) {
  const { slug } = await params
  const profile = getAuthorProfile(slug)

  if (!profile) notFound()

  const redirectTarget = redirectTargetFor(slug, profile.frontMatter)
  if (redirectTarget) permanentRedirect(redirectTarget)

  const articles = await getArticlesByAuthor(slug)
  const { frontMatter, content } = profile

  const schema = authorProfileSchema({ slug, frontMatter, articles })
  const breadcrumbs = breadcrumbSchema([
    { name: 'Inicio', path: '/' },
    { name: 'Quiénes Somos', path: ORG_PROFILE_PATH },
    { name: frontMatter.name || slug, path: authorProfilePath(slug) },
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      <LayoutWrapper>
        <AuthorProfile
          frontMatter={frontMatter}
          paragraphs={bodyParagraphs(content)}
          articles={articles.map((article) => ({
            slug: article.slug,
            title: article.title,
            summary: article.summary || '',
            date: article.date,
          }))}
        />
      </LayoutWrapper>
    </>
  )
}
