import { getArticle, listArticles } from '@/lib/articles'
import { compileMDX, extractToc } from '@/lib/mdx-renderer'
import { getAuthorDetails } from '@/lib/authors'
import LayoutWrapper from '@/components/LayoutWrapper'
import BlogPost from './BlogPost'
import { notFound } from 'next/navigation'
import siteMetadata from '@/data/siteMetadata'
import readingTime from 'reading-time'

export async function generateStaticParams() {
  const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
  return result.articles.map((article) => ({
    slug: article.slug.split('/'),
  }))
}

export const dynamicParams = true
export const revalidate = 3600

export async function generateMetadata({ params }) {
  const { slug } = await params
  const slugStr = slug.join('/')

  try {
    const article = await getArticle(slugStr)

    // Return 404 for drafts
    if (article.draft) {
      return {}
    }

    return {
      title: article.title,
      description: article.summary,
      openGraph: {
        title: article.title,
        description: article.summary,
        type: 'article',
        publishedTime: article.date,
        modifiedTime: article.lastmod || article.date,
        url: `${siteMetadata.siteUrl}/blog/${slugStr}`,
        images: article.images || [siteMetadata.socialBanner],
      },
      twitter: {
        card: 'summary_large_image',
        title: article.title,
        description: article.summary,
        images: article.images || [siteMetadata.socialBanner],
      },
    }
  } catch (error) {
    // Article not found
    return {}
  }
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

  // Return 404 for drafts
  if (article.draft) {
    notFound()
  }

  // Get all published articles for prev/next navigation
  const allResult = await listArticles({ includeDrafts: false, pageSize: 9999 })
  const allArticles = allResult.articles

  // Find current article index
  const postIndex = allArticles.findIndex((post) => post.slug === slugStr)
  const prev = allArticles[postIndex + 1] || null
  const next = allArticles[postIndex - 1] || null

  // Compile MDX
  const { mdxSource } = await compileMDX(article.content)

  // Extract TOC
  const toc = extractToc(article.content)

  // Get author details
  const authorDetails = await getAuthorDetails(article.authors || ['default'])

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
    datePublished: article.date,
    dateModified: article.lastmod || article.date,
    description: article.summary,
    image: article.images || [siteMetadata.socialBanner],
    url: `${siteMetadata.siteUrl}/blog/${slugStr}`,
    author: authorDetails.map((author) => ({
      '@type': 'Person',
      name: author.name,
    })),
    publisher: {
      '@type': 'Organization',
      name: siteMetadata.author,
      logo: {
        '@type': 'ImageObject',
        url: siteMetadata.siteLogoLight,
      },
    },
  }

  return (
    <LayoutWrapper>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogPost
        mdxSource={mdxSource}
        toc={toc}
        frontMatter={frontMatter}
        authorDetails={authorDetails}
        prev={prev}
        next={next}
      />
    </LayoutWrapper>
  )
}
