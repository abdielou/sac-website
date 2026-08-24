import Link from '@/components/Link'

/** Marker returned by getPageNumbers for a collapsed run of pages. */
export const ELLIPSIS = 'ellipsis'

/** Pages shown on each side of the current one. */
const SIBLING_COUNT = 2

/**
 * Largest run of pages rendered in full rather than collapsed.
 * An ellipsis that hides one or two pages costs the same room as the pages
 * themselves and crawls nothing, so render them instead.
 */
const MAX_FILLED_GAP = 2

/**
 * Parse a `/blog/page/[page]` route segment.
 *
 * Returns the page number only when the segment is a positive integer, so the
 * route can call notFound() instead of serving a soft 404. Before this guard,
 * /blog/page/999 returned HTTP 200, rendered every article as a near duplicate
 * of /blog, and linked on to page 998, which did the same again.
 *
 * '0', '-1', '01', '1.5', 'abc' and '' all return null.
 */
export function parsePageParam(value) {
  return /^[1-9][0-9]*$/.test(String(value)) ? Number(value) : null
}

/** Page 1 of the listing lives at /blog, never at /blog/page/1. */
export function pageHref(page) {
  const number = Number(page)
  return Number.isFinite(number) && number > 1 ? `/blog/page/${number}` : '/blog'
}

/**
 * Build the page numbers the pagination renders: the first page, the current
 * page with `siblingCount` neighbours on each side, the last page, and ELLIPSIS
 * for each collapsed run.
 *
 * A run of up to MAX_FILLED_GAP pages renders in full instead of collapsing, so
 * a short archive keeps every page as a crawlable link.
 *
 * @param {number} currentPage
 * @param {number} totalPages
 * @param {number} [siblingCount]
 * @returns {Array<number|string>} Page numbers, with ELLIPSIS between gaps.
 */
export function getPageNumbers(currentPage, totalPages, siblingCount = SIBLING_COUNT) {
  const total = Math.floor(Number(totalPages))
  if (!Number.isFinite(total) || total < 1) return []

  const parsed = Math.floor(Number(currentPage))
  const current = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), total) : 1
  const siblings = Math.max(0, Math.floor(Number(siblingCount)) || 0)

  const wanted = new Set([1, total])
  for (let page = current - siblings; page <= current + siblings; page += 1) {
    if (page >= 1 && page <= total) wanted.add(page)
  }

  const sorted = [...wanted].sort((a, b) => a - b)
  return sorted.reduce((acc, page, index) => {
    const missing = index > 0 ? page - sorted[index - 1] - 1 : 0
    if (missing > MAX_FILLED_GAP) {
      acc.push(ELLIPSIS)
    } else {
      for (let filler = page - missing; filler < page; filler += 1) acc.push(filler)
    }
    acc.push(page)
    return acc
  }, [])
}

const linkClass = 'hover:text-primary-600 dark:hover:text-primary-400'

export default function Pagination({ totalPages, currentPage }) {
  const total = Math.floor(Number(totalPages)) || 0
  const current = Math.floor(Number(currentPage)) || 1
  const pages = getPageNumbers(current, total)
  const hasPrev = current - 1 >= 1
  const hasNext = current + 1 <= total

  return (
    <div className="pt-6 pb-8 space-y-2 md:space-y-5">
      <nav className="flex items-center justify-between" aria-label="Paginación de artículos">
        {hasPrev ? (
          <Link
            href={pageHref(current - 1)}
            rel="prev"
            aria-label="Página anterior"
            className={linkClass}
          >
            Anterior
          </Link>
        ) : (
          <span className="opacity-50" aria-hidden="true">
            Anterior
          </span>
        )}
        <span className="sr-only">
          Página {current} de {total}
        </span>
        <ol className="flex items-center space-x-1 sm:space-x-2">
          {pages.map((page, index) =>
            page === ELLIPSIS ? (
              <li key={`${ELLIPSIS}-${index}`} className="px-1" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={page}>
                <Link
                  href={pageHref(page)}
                  aria-label={`Página ${page}`}
                  aria-current={page === current ? 'page' : undefined}
                  className={
                    page === current
                      ? 'px-2 py-1 font-bold text-primary-500'
                      : `px-2 py-1 ${linkClass}`
                  }
                >
                  {page}
                </Link>
              </li>
            )
          )}
        </ol>
        {hasNext ? (
          <Link
            href={pageHref(current + 1)}
            rel="next"
            aria-label="Página siguiente"
            className={linkClass}
          >
            Siguiente
          </Link>
        ) : (
          <span className="opacity-50" aria-hidden="true">
            Siguiente
          </span>
        )}
      </nav>
    </div>
  )
}
