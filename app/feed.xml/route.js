import { listArticles } from '@/lib/articles'
import siteMetadata from '@/data/siteMetadata'
import { escape } from '@/lib/utils/htmlEscaper'

export const revalidate = 3600

const generateRssItem = (post) => `
  <item>
    <guid>${siteMetadata.siteUrl}/blog/${post.slug}</guid>
    <title>${escape(post.title)}</title>
    <link>${siteMetadata.siteUrl}/blog/${post.slug}</link>
    ${post.summary ? `<description>${escape(post.summary)}</description>` : ''}
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <author>${siteMetadata.email} (${siteMetadata.author})</author>
    ${post.tags && Array.isArray(post.tags) ? post.tags.map((t) => `<category>${escape(t)}</category>`).join('') : ''}
  </item>
`

export async function GET() {
  try {
    // Get all published articles
    const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
    const articles = result.articles || []

    // Determine lastBuildDate
    const lastBuildDate =
      articles.length > 0 ? new Date(articles[0].date).toUTCString() : new Date().toUTCString()

    // Generate RSS XML
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(siteMetadata.title)}</title>
    <link>${siteMetadata.siteUrl}/blog</link>
    <description>${escape(siteMetadata.description)}</description>
    <language>${siteMetadata.language}</language>
    <managingEditor>${siteMetadata.email} (${siteMetadata.author})</managingEditor>
    <webMaster>${siteMetadata.email} (${siteMetadata.author})</webMaster>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${siteMetadata.siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    ${articles.map(generateRssItem).join('')}
  </channel>
</rss>`

    return new Response(rssXml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch (error) {
    console.error('Error generating RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
