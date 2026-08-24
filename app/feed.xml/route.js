import { listArticles } from '@/lib/articles'
import siteMetadata from '@/data/siteMetadata'
import { absUrl, articleUrl, safeModified, toIso } from '@/lib/seo'
import { escape } from '@/lib/utils/htmlEscaper'

export const revalidate = 3600

const generateRssItem = (post) => {
  const url = articleUrl(post.slug)
  return `
  <item>
    <guid>${url}</guid>
    <title>${escape(post.title)}</title>
    <link>${url}</link>
    ${post.summary ? `<description>${escape(post.summary)}</description>` : ''}
    <pubDate>${new Date(toIso(post.date)).toUTCString()}</pubDate>
    <author>${siteMetadata.email} (${siteMetadata.author})</author>
    ${post.tags && Array.isArray(post.tags) ? post.tags.map((t) => `<category>${escape(t)}</category>`).join('') : ''}
  </item>
`
}

export async function GET() {
  try {
    // Get all published articles
    const result = await listArticles({ includeDrafts: false, pageSize: 9999 })
    const articles = result.articles || []

    // lastBuildDate is the latest content date in the channel. Taking the max
    // over every item, rather than trusting articles[0], keeps it from ever
    // preceding a pubDate even if the index is not sorted newest-first.
    const latest = articles.reduce(
      (max, post) => Math.max(max, new Date(safeModified(post.date, post.lastmod)).getTime()),
      0
    )
    const lastBuildDate = new Date(latest || Date.now()).toUTCString()

    // Generate RSS XML
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(siteMetadata.title)}</title>
    <link>${absUrl('/blog')}</link>
    <description>${escape(siteMetadata.description)}</description>
    <language>${siteMetadata.language}</language>
    <managingEditor>${siteMetadata.email} (${siteMetadata.author})</managingEditor>
    <webMaster>${siteMetadata.email} (${siteMetadata.author})</webMaster>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${absUrl('/feed.xml')}" rel="self" type="application/rss+xml"/>
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
