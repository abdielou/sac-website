import { cache } from 'react'
import { notFound } from 'next/navigation'
import { listArticles } from '@/lib/articles'
import LayoutWrapper from '@/components/LayoutWrapper'
import ListLayout from '@/layouts/ListLayout'
import kebabCase from '@/lib/utils/kebabCase'
import { pageMetadata, noindexMetadata } from '@/lib/seo'

export const dynamicParams = true
export const revalidate = 3600

/**
 * Turn a kebab-cased tag slug back into a display title.
 * 'lluvia-de-meteoros' -> 'Lluvia De Meteoros'
 *
 * The previous implementation split on ' ', which a kebab slug never contains,
 * and then sliced the rejoined string instead of the tail of the first word,
 * so 'luna-llena' rendered as 'Luna-llena' minus its first character.
 * Accented first letters are handled: 'ñandú' -> 'Ñandú'.
 */
/**
 * Spanish sentence case: only the first word is capitalised. Capitalising every
 * word would render 'lluvia-de-meteoros' as 'Lluvia De Meteoros', which is
 * English title case and wrong in Spanish. Short words that are genuinely part
 * of a name keep whatever case the slug carries after the first character.
 */
export function tagDisplayTitle(tag) {
  const words = String(tag ?? '')
    .split('-')
    .filter(Boolean)
  if (words.length === 0) return ''
  const [first, ...rest] = words
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ')
}

/** Spanish page title used for both the metadata title and the h1. */
function tagPageTitle(tag) {
  return `Artículos sobre ${tagDisplayTitle(tag)}`
}

/**
 * Published articles carrying `tag`, deduplicated per request so that
 * generateMetadata and the page body share a single article fetch.
 */
const getArticlesForTag = cache(async (tag) => {
  const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
  return (result.articles || []).filter(
    (post) => Array.isArray(post.tags) && post.tags.some((t) => kebabCase(t) === tag)
  )
})

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
  const title = tagPageTitle(tag)
  const path = `/tags/${tag}`
  const articles = await getArticlesForTag(tag)
  const count = articles.length

  // An unknown tag renders the 404 boundary, so it must never be indexable.
  if (count === 0) {
    return noindexMetadata({
      title,
      description: 'No hay artículos publicados sobre este tema.',
      path,
    })
  }

  const noun = count === 1 ? 'artículo' : 'artículos'
  return pageMetadata({
    title,
    description: `${count} ${noun} sobre ${tagDisplayTitle(
      tag
    )} en el blog de la Sociedad de Astronomía del Caribe.`,
    path,
  })
}

export default async function TagPage({ params }) {
  const tag = (await params).tag

  const filteredPosts = await getArticlesForTag(tag)

  // An arbitrary slug used to render an empty list with HTTP 200: a soft 404.
  if (filteredPosts.length === 0) notFound()

  return (
    <LayoutWrapper>
      <ListLayout posts={filteredPosts} title={tagPageTitle(tag)} />
    </LayoutWrapper>
  )
}
