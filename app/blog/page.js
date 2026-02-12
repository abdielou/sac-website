import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import ListLayout from '@/layouts/ListLayout'
import siteMetadata from '@/data/siteMetadata'

export const metadata = {
  title: `Artículos | ${siteMetadata.author}`,
  description: siteMetadata.description,
}

export const POSTS_PER_PAGE = 5

// Revalidate every hour as safety net (on-demand revalidation is primary)
export const revalidate = 3600

export default async function BlogPage() {
  // Get paginated articles for page 1
  const paginatedResult = await listArticles({
    includeDrafts: false,
    page: 1,
    pageSize: POSTS_PER_PAGE,
  })

  // Get ALL published articles for client-side search
  const allResult = await listArticles({ includeDrafts: false, pageSize: 9999 })

  const pagination = {
    currentPage: 1,
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
