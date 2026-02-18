import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import Link from '@/components/Link'
import Tag from '@/components/Tag'
import kebabCase from '@/lib/utils/kebabCase'
import siteMetadata from '@/data/siteMetadata'

export const metadata = {
  title: `Tags - ${siteMetadata.author}`,
  description: 'Things I blog about',
}

export const revalidate = 3600

export default async function TagsPage() {
  // Get all published articles to compute tag counts
  const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
  const articles = result.articles || []

  // Compute tag counts
  const tagCounts = {}
  articles.forEach((article) => {
    if (Array.isArray(article.tags)) {
      article.tags.forEach((tag) => {
        const kebabTag = kebabCase(tag)
        tagCounts[kebabTag] = (tagCounts[kebabTag] || 0) + 1
      })
    }
  })

  // Sort tags by count descending
  const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a])

  return (
    <LayoutWrapper>
      <div className="flex flex-col items-start justify-start divide-y divide-gray-200 dark:divide-gray-700 md:justify-center md:items-center md:divide-y-0 md:flex-row md:space-x-6 md:mt-24">
        <div className="pt-6 pb-8 space-x-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14 md:border-r-2 md:px-6">
            Tags
          </h1>
        </div>
        <div className="flex flex-wrap max-w-lg">
          {Object.keys(tagCounts).length === 0 && 'No tags found.'}
          {sortedTags.map((t) => {
            return (
              <div key={t} className="mt-2 mb-2 mr-5">
                <Tag text={t} />
                <Link
                  href={`/tags/${t}`}
                  className="-ml-2 text-sm font-semibold text-gray-600 uppercase dark:text-gray-300"
                >
                  {` (${tagCounts[t]})`}
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </LayoutWrapper>
  )
}
