import { getArticle, listArticles } from '@/lib/articles'
import { extractToc } from '@/lib/mdx-renderer'
import { getAuthorDetails } from '@/lib/authors'
import LayoutWrapper from '@/components/LayoutWrapper'
import BlogPost from './BlogPost'
import { notFound } from 'next/navigation'
import readingTime from 'reading-time'
import kebabCase from '@/lib/utils/kebabCase'
import {
  ORGANIZATION_ID,
  absoluteImages,
  articleUrl,
  breadcrumbSchema,
  jsonLdScript,
  noindexMetadata,
  pageMetadata,
  safeModified,
  toIso,
} from '@/lib/seo'

export const RELATED_ARTICLE_LIMIT = 4

const BLOG_LABEL = 'Artículos'
const MISSING_TITLE = 'Artículo no disponible'
const MISSING_DESCRIPTION = 'No encontramos el artículo solicitado.'

export async function generateStaticParams() {
  const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
  return result.articles.map((article) => ({
    slug: article.slug.split('/'),
  }))
}

export const dynamicParams = true
export const revalidate = 3600

/** De-duplicated, kebab-cased tags of one article, so 'Luna llena' and 'luna-llena' match. */
function normalizedTags(article) {
  const tags = Array.isArray(article?.tags) ? article.tags : []
  return new Set(tags.filter(Boolean).map((tag) => kebabCase(String(tag))))
}

/**
 * Rank the other published articles by the number of tags they share with the
 * current one. Ties break on date proximity, then on slug so the order stays
 * stable between builds.
 *
 * An article with no shared tag is never returned. 13 of the 77 articles carry
 * no tags at all, and prev/next remains their only related-content fallback.
 *
 * @param {object} current    The article being rendered.
 * @param {object[]} articles All published articles, the current one included.
 * @param {number} [limit]    Maximum number of related articles.
 * @returns {object[]} The highest scoring articles, best first.
 */
export function selectRelatedArticles(current, articles, limit = RELATED_ARTICLE_LIMIT) {
  const currentTags = normalizedTags(current)
  if (currentTags.size === 0) return []

  const currentTime = new Date(current?.date).getTime()
  const list = Array.isArray(articles) ? articles : []

  return list
    .filter((candidate) => candidate && candidate.slug && candidate.slug !== current?.slug)
    .map((candidate) => {
      let shared = 0
      for (const tag of normalizedTags(candidate)) {
        if (currentTags.has(tag)) shared += 1
      }
      const time = new Date(candidate.date).getTime()
      const comparable = !Number.isNaN(time) && !Number.isNaN(currentTime)
      return {
        candidate,
        shared,
        distance: comparable ? Math.abs(time - currentTime) : Number.MAX_SAFE_INTEGER,
      }
    })
    .filter((entry) => entry.shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        a.distance - b.distance ||
        String(a.candidate.slug).localeCompare(String(b.candidate.slug))
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.candidate)
}

/** Author frontmatter for an article, falling back to the SAC default author. */
async function resolveAuthorDetails(authors) {
  const slugs = Array.isArray(authors) && authors.length > 0 ? authors : ['default']
  try {
    return await getAuthorDetails(slugs)
  } catch (error) {
    return []
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const slugStr = slug.join('/')
  const path = `/blog/${slugStr}`

  let article
  try {
    article = await getArticle(slugStr)
  } catch (error) {
    // A transient S3 failure must not publish an indexable page that inherits
    // the site-wide title. The page body calls notFound() for the same case.
    return noindexMetadata({ title: MISSING_TITLE, description: MISSING_DESCRIPTION, path })
  }

  // Drafts and archived articles must never be indexable. listArticles()
  // already hides archived posts from /blog, the tag hubs and the sitemap, so
  // without this an archived article stays a live, indexable orphan URL.
  if (article.draft || article.archived) {
    return noindexMetadata({
      title: article.title || MISSING_TITLE,
      description: article.summary || MISSING_DESCRIPTION,
      path,
    })
  }

  const images = absoluteImages(article.images)
  const primaryImage = { url: images[0], alt: article.title }
  const width = Number(article.imgWidth)
  const height = Number(article.imgHeight)
  if (Number.isFinite(width) && width > 0) primaryImage.width = width
  if (Number.isFinite(height) && height > 0) primaryImage.height = height

  const authorDetails = await resolveAuthorDetails(article.authors)

  return pageMetadata({
    title: article.title,
    description: article.summary || undefined,
    path,
    openGraph: {
      type: 'article',
      publishedTime: toIso(article.date),
      modifiedTime: safeModified(article.date, article.lastmod),
      images: [primaryImage, ...images.slice(1)],
      authors: authorDetails.map((author) => author.name).filter(Boolean),
      tags: Array.isArray(article.tags) ? article.tags : [],
    },
    twitter: { images },
  })
}

export default async function PostPage({ params }) {
  const { slug } = await params
  const slugStr = slug.join('/')

  // Get article from S3
  let article
  try {
    article = await getArticle(slugStr)
  } catch (error) {
    notFound()
  }

  // Return 404 for drafts and archived articles. Both are excluded from every
  // listing, so serving them at 200 would leave an indexable orphan URL.
  if (article.draft || article.archived) {
    notFound()
  }

  // Get all published articles for prev/next navigation and related articles
  const allResult = await listArticles({ includeDrafts: false, pageSize: 9999 })
  const allArticles = allResult.articles

  // Find current article index
  const postIndex = allArticles.findIndex((post) => post.slug === slugStr)
  const prev = postIndex >= 0 ? allArticles[postIndex + 1] || null : null
  const next = postIndex >= 0 ? allArticles[postIndex - 1] || null : null

  // Tag based related articles, the main source of internal links between posts
  const related = selectRelatedArticles({ ...article, slug: slugStr }, allArticles).map(
    (candidate) => ({
      slug: candidate.slug,
      title: candidate.title,
      summary: candidate.summary || '',
      date: candidate.date,
    })
  )

  // Extract TOC
  const toc = extractToc(article.content)

  // Get author details
  const authorDetails = await resolveAuthorDetails(article.authors)

  // Build frontMatter object matching PostLayout expectations
  const frontMatter = {
    slug: slugStr,
    date: article.date,
    title: article.title,
    tags: article.tags,
    lastmod: article.lastmod,
    summary: article.summary,
    images: article.images,
    readingTime: readingTime(article.content),
  }

  // Structured data for SEO (JSON-LD)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary,
    inLanguage: 'es-PR',
    datePublished: toIso(article.date),
    dateModified: safeModified(article.date, article.lastmod),
    image: absoluteImages(article.images),
    url: articleUrl(slugStr),
    author: authorDetails.map((author) => {
      const node = { '@type': 'Person', name: author.name }
      if (author.twitter) node.sameAs = [author.twitter]
      return node
    }),
    publisher: { '@id': ORGANIZATION_ID },
  }

  if (Array.isArray(article.tags) && article.tags.length > 0) {
    jsonLd.keywords = article.tags.join(', ')
  }

  const breadcrumbs = breadcrumbSchema([
    { name: 'Inicio', path: '/' },
    { name: BLOG_LABEL, path: '/blog' },
    { name: article.title, path: `/blog/${slugStr}` },
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      <LayoutWrapper>
        <BlogPost
          source={article.content}
          toc={toc}
          frontMatter={frontMatter}
          authorDetails={authorDetails}
          prev={prev}
          next={next}
          related={related}
        />
      </LayoutWrapper>
    </>
  )
}
