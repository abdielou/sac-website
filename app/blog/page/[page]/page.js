import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import ListLayout from '@/layouts/ListLayout'
import siteMetadata from '@/data/siteMetadata'

const POSTS_PER_PAGE = 5

export const metadata = {
  title: `Artículos | ${siteMetadata.author}`,
  description: siteMetadata.description,
}

export async function generateStaticParams() {
  // Get total article count to determine how many pages to generate
  const result = await listArticles({ includeDrafts: false, pageSize: 1 })
  const totalPages = Math.ceil(result.total / POSTS_PER_PAGE)

  // Generate params for all page numbers
  return Array.from({ length: totalPages }, (_, i) => ({
    page: String(i + 1),
  }))
}

// Allow dynamic params for newly published articles
export const dynamicParams = true

// Revalidate every hour as safety net
export const revalidate = 3600

export default async function BlogPageN({ params }) {
  const { page } = await params
  const pageNumber = parseInt(page, 10)

  // Get paginated articles for current page
  const paginatedResult = await listArticles({
    includeDrafts: false,
    page: pageNumber,
    pageSize: POSTS_PER_PAGE,
  })

  // Get ALL published articles for client-side search
  const allResult = await listArticles({ includeDrafts: false, pageSize: 9999 })

  const pagination = {
    currentPage: pageNumber,
    totalPages: paginatedResult.totalPages,
  }

  return (
    <LayoutWrapper>
      <ListLayout
        posts={allResult.articles}
        initialDisplayPosts={paginatedResult.articles}
        pagination={pagination}
        title="Artículos"
      />
    </LayoutWrapper>
  )
}
