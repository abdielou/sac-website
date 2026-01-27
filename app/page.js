import { getAllFilesFrontMatter } from '@/lib/mdx'
import LayoutWrapper from '@/components/LayoutWrapper'
import HomeContent from './HomeContent'
import siteMetadata from '@/data/siteMetadata'

export const metadata = {
  title: siteMetadata.title,
  description: siteMetadata.description,
}

export default async function HomePage() {
  const posts = await getAllFilesFrontMatter('blog')

  return (
    <LayoutWrapper>
      <HomeContent posts={posts} />
    </LayoutWrapper>
  )
}
