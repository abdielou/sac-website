import { cache } from 'react'
import { notFound } from 'next/navigation'
import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import ListLayout from '@/layouts/ListLayout'
import { parsePageParam } from '@/components/Pagination'
import { pageMetadata, noindexMetadata } from '@/lib/seo'
import { POSTS_PER_PAGE, listingTitle, toSearchIndex } from '@/lib/blog-pagination'

const BLOG_DESCRIPTION =
  'Artículos, noticias y guías de astronomía de la Sociedad de Astronomía del Caribe, Puerto Rico.'

/**
 * Resolve a page segment to its articles, or null when the page does not exist.
 *
 * `cache` dedupes the S3 index read between generateMetadata and the render of
 * the same request.
 */
const loadPage = cache(async (rawPage) => {
  const pageNumber = parsePageParam(rawPage)
  if (!pageNumber) return null

  const result = await listArticles({
    includeDrafts: false,
    page: pageNumber,
    pageSize: POSTS_PER_PAGE,
  })

  // An empty archive still has one page, so /blog/page/1 never 404s.
  const totalPages = Math.max(1, result.totalPages)
  if (pageNumber > totalPages) return null

  return { pageNumber, totalPages, articles: result.articles }
})

export async function generateMetadata({ params }) {
  const { page } = await params
  const resolved = await loadPage(page)

  // Out of range: notFound() runs in the component, but keep the response out
  // of the index in case a crawler sees the segment metadata.
  if (!resolved) {
    return noindexMetadata({
      title: 'Página no encontrada',
      description: BLOG_DESCRIPTION,
      path: '/blog',
    })
  }

  const { pageNumber, totalPages } = resolved

  // /blog/page/1 duplicates /blog, so point its canonical at /blog.
  const path = pageNumber === 1 ? '/blog' : `/blog/page/${pageNumber}`
  const title = pageNumber === 1 ? 'Artículos' : `Artículos, página ${pageNumber}`
  const description =
    pageNumber === 1
      ? BLOG_DESCRIPTION
      : `${BLOG_DESCRIPTION} Página ${pageNumber} de ${totalPages}.`

  return pageMetadata({ title, description, path })
}

export async function generateStaticParams() {
  // Get total article count to determine how many pages to generate
  const result = await listArticles({ includeDrafts: false, pageSize: 1 })
  const totalPages = Math.ceil(result.total / POSTS_PER_PAGE)

  // Start at page 2. Page 1 is a byte-identical duplicate of /blog and
  // next.config.js redirects it there, so prerendering it is wasted work.
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({
    page: String(i + 2),
  }))
}

// Allow dynamic params for newly published articles
export const dynamicParams = true

// Revalidate every hour as safety net
export const revalidate = 3600

export default async function BlogPageN({ params }) {
  const { page } = await params
  const resolved = await loadPage(page)

  // A bad or out-of-range page used to return HTTP 200 and render the whole
  // corpus, then link on to the page below it. Return a real 404 instead.
  if (!resolved) notFound()

  const { pageNumber, totalPages, articles } = resolved

  // Get ALL published articles for client-side search
  const allResult = await listArticles({ includeDrafts: false, pageSize: 9999 })

  const pagination = {
    currentPage: pageNumber,
    totalPages,
  }

  return (
    <LayoutWrapper>
      <ListLayout
        posts={toSearchIndex(allResult.articles)}
        initialDisplayPosts={articles}
        pagination={pagination}
        paginated
        title={listingTitle(pageNumber)}
      />
    </LayoutWrapper>
  )
}
