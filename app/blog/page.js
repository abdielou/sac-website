import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import ListLayout from '@/layouts/ListLayout'
import { pageMetadata } from '@/lib/seo'
import { POSTS_PER_PAGE } from '@/lib/blog-pagination'

// Re-exported for existing importers. The value lives in lib/blog-pagination.js.
export { POSTS_PER_PAGE }

export const BLOG_DESCRIPTION =
  'Artículos, noticias y guías de astronomía de la Sociedad de Astronomía del Caribe, Puerto Rico.'

// The root layout appends ' | SAC' through its title template, so the title
// here must not repeat the site name.
export const metadata = pageMetadata({
  title: 'Artículos',
  description: BLOG_DESCRIPTION,
  path: '/blog',
})

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
        paginated
        title="Artículos"
      />
    </LayoutWrapper>
  )
}
