import { listArticles } from '@/lib/articles'
import kebabCase from '@/lib/utils/kebabCase'
import { absUrl, articleUrl, safeModified } from '@/lib/seo'
import { POSTS_PER_PAGE } from '@/lib/blog-pagination'
import { listPublishedEditions } from './api/guides/guide-editions'
import { listAuthorSlugs, getAuthorProfile } from '@/lib/authors'

export const revalidate = 3600

/**
 * Public routes that have an index page under app/.
 *
 * Deliberately absent:
 *  - /admin, /member, /auth, /verify, /api  private or non-indexable
 *  - /card-test-longname                    a development fixture
 *  - /media                                 only app/media/[slug] exists, there
 *                                           is no /media index page to link to
 */
const STATIC_ROUTES = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/blog', changeFrequency: 'daily', priority: 0.9 },
  { path: '/events', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/membership', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/donate', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/guides', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/weather', changeFrequency: 'daily', priority: 0.6 },
  { path: '/tags', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/links', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/brand', changeFrequency: 'yearly', priority: 0.3 },
  // Legacy Pages Router route. Still live and self-declares index,follow via
  // PageSEO, so it belongs here even though it is not in the nav.
  { path: '/gallery', changeFrequency: 'weekly', priority: 0.6 },
]

function staticEntries(lastModified) {
  return STATIC_ROUTES.map((route) => ({
    url: absUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}

/** Unique tag slugs, produced exactly as app/tags/[tag]/page.js produces them. */
function tagSlugs(articles) {
  const slugs = new Set()
  for (const article of articles) {
    if (!Array.isArray(article?.tags)) continue
    for (const tag of article.tags) {
      const slug = kebabCase(String(tag ?? ''))
      if (slug) slugs.add(slug)
    }
  }
  return Array.from(slugs).sort()
}

export default async function sitemap() {
  const now = new Date().toISOString()

  let articles = []
  try {
    const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
    articles = Array.isArray(result?.articles) ? result.articles : []
  } catch (error) {
    // The article index lives in S3. If it is unreachable, still serve the
    // static routes: a partial sitemap beats a 500 and no sitemap at all.
    console.error('sitemap: listArticles failed, emitting static routes only', error)
    return staticEntries(now)
  }

  const entries = staticEntries(now)

  // /blog/page/2 .. /blog/page/N. Page 1 is a byte-identical duplicate of /blog
  // and next.config.js redirects it there, so it is never emitted.
  const totalPages = Math.ceil(articles.length / POSTS_PER_PAGE)
  for (let page = 2; page <= totalPages; page += 1) {
    entries.push({
      url: absUrl(`/blog/page/${page}`),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.4,
    })
  }

  for (const tag of tagSlugs(articles)) {
    entries.push({
      url: absUrl(`/tags/${tag}`),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.3,
    })
  }

  for (const article of articles) {
    if (!article?.slug) continue
    entries.push({
      url: articleUrl(article.slug),
      lastModified: safeModified(article.date, article.lastmod),
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  }

  // One URL per guide edition. These hold the only original first-party data on
  // the site, and until now all three editions shared /guides.
  try {
    for (const edition of await listPublishedEditions()) {
      if (!edition?.path) continue
      entries.push({
        url: absUrl(edition.path),
        lastModified: edition.publishedAt ? new Date(edition.publishedAt).toISOString() : now,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
  } catch (error) {
    console.error('sitemap: guide editions failed, continuing without them', error)
  }

  // Author profiles. Files carrying a canonicalSlug are aliases that redirect,
  // so only the canonical target is submitted.
  try {
    for (const slug of listAuthorSlugs()) {
      if (slug === 'default') continue
      const profile = getAuthorProfile(slug)
      if (!profile || profile.frontMatter?.canonicalSlug) continue
      entries.push({
        url: absUrl(`/authors/${slug}`),
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }
  } catch (error) {
    console.error('sitemap: author profiles failed, continuing without them', error)
  }

  return entries
}
