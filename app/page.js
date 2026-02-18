import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import HomeContent from './HomeContent'
import siteMetadata from '@/data/siteMetadata'

export const metadata = {
  title: siteMetadata.title,
  description: siteMetadata.description,
}

// Revalidate every hour as safety net (on-demand revalidation is primary)
export const revalidate = 3600

export default async function HomePage() {
  const result = await listArticles({ includeDrafts: false, pageSize: 5 })
  const posts = result.articles

  return (
    <LayoutWrapper>
      <HomeContent posts={posts} />
    </LayoutWrapper>
  )
}
