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
