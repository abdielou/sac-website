/**
 * Single source of truth for blog pagination.
 *
 * This lived as a separate literal in app/blog/page.js, app/blog/page/[page]/page.js
 * and app/sitemap.js. When the page size changed from 5 to 15, the sitemap kept
 * emitting /blog/page/2..16 while the routes only served 6 pages, putting ten
 * 404s in the sitemap. Import it, never redeclare it.
 *
 * It lives in lib/ rather than in a route module so the sitemap can read it
 * without pulling a React page and its layout tree into the build.
 */
export const POSTS_PER_PAGE = 15

/** Total pages for a given published-article count (always at least 1). */
export function totalPagesFor(totalArticles) {
  return Math.max(1, Math.ceil((Number(totalArticles) || 0) / POSTS_PER_PAGE))
}

/**
 * The only fields ListLayout's client-side search and ArticleItem actually read.
 *
 * Every listing page serialises the whole corpus into its RSC payload to power
 * the search box. The stored index entry carries 12 fields; this renders 8, so
 * lastmod, authors, draft and archived were being shipped to the browser on
 * /blog and on every /blog/page/N for no reason. The payload grows with every
 * article published, so projecting matters more over time, not less.
 */
export const SEARCH_INDEX_FIELDS = [
  'slug',
  'title',
  'summary',
  'tags',
  'date',
  'images',
  'imgWidth',
  'imgHeight',
]

/** Project articles down to SEARCH_INDEX_FIELDS before handing them to a client component. */
export function toSearchIndex(articles = []) {
  return articles.map((article) => {
    const entry = {}
    for (const field of SEARCH_INDEX_FIELDS) {
      if (article?.[field] !== undefined) entry[field] = article[field]
    }
    // ListLayout joins tags unconditionally when searching.
    if (!Array.isArray(entry.tags)) entry.tags = []
    return entry
  })
}

/** Spanish h1 and page title for a listing page. Page 1 stays unqualified. */
export function listingTitle(pageNumber) {
  const n = Number(pageNumber)
  return !n || n <= 1 ? 'Artículos' : `Artículos, página ${n}`
}

/**
 * Mark the first <Image> in an article body as the LCP candidate.
 *
 * next/image lazy-loads by default, so the largest image on the page — usually
 * the first one, right under the title — was being deferred on every article.
 * `sizes` already caps how many bytes it costs; this stops it waiting.
 *
 * Done as a string transform on the stored MDX rather than in the component map,
 * because that map is module-level and a render counter there would leak between
 * concurrent requests. This is deterministic and request-safe.
 *
 * Only the FIRST occurrence is touched, and only when it does not already
 * declare `priority`, so an author can still opt out by writing it themselves.
 */
export function markFirstImagePriority(source) {
  const text = String(source ?? '')
  const match = text.match(/<Image\b[^>]*?\/?>/)
  if (!match) return text
  const tag = match[0]
  if (/\bpriority\b/.test(tag)) return text
  const patched = tag.replace(/\s*(\/?)>$/, ' priority fetchPriority="high"$1>')
  return text.replace(tag, patched)
}
