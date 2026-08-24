import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import HomeContent from './HomeContent'
import siteMetadata from '@/data/siteMetadata'
import { pageMetadata } from '@/lib/seo'

// The root layout appends ' | SAC', so the title must not repeat the site name.
export const metadata = pageMetadata({
  title: 'Astronomía en Puerto Rico',
  description: siteMetadata.description,
  path: '/',
})

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
