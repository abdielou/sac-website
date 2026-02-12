import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import ListLayout from '@/layouts/ListLayout'
import kebabCase from '@/lib/utils/kebabCase'
import siteMetadata from '@/data/siteMetadata'

export const dynamicParams = true
export const revalidate = 3600

export async function generateStaticParams() {
  // Get all published articles to collect unique tags
  const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
  const articles = result.articles || []

  const tagsSet = new Set()
  articles.forEach((article) => {
    if (Array.isArray(article.tags)) {
      article.tags.forEach((tag) => {
        tagsSet.add(kebabCase(tag))
      })
    }
  })

  return Array.from(tagsSet).map((tag) => ({ tag }))
}

export async function generateMetadata({ params }) {
  const tag = (await params).tag

  return {
    title: `${tag} - ${siteMetadata.author}`,
    description: `${tag} tags - ${siteMetadata.author}`,
    alternates: {
      types: {
        'application/rss+xml': `${siteMetadata.siteUrl}/tags/${tag}/feed.xml`,
      },
    },
  }
}

export default async function TagPage({ params }) {
  const tag = (await params).tag

  // Get all articles and filter by tag (matching kebab-cased tags)
  const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
  const filteredPosts = (result.articles || []).filter(
    (post) => Array.isArray(post.tags) && post.tags.some((t) => kebabCase(t) === tag)
  )

  // Capitalize tag for display title
  const title = tag[0].toUpperCase() + tag.split(' ').join('-').slice(1)

  return (
    <LayoutWrapper>
      <ListLayout posts={filteredPosts} title={title} />
    </LayoutWrapper>
  )
}
