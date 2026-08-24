/**
 * Crawl infrastructure: app/sitemap.js, app/robots.js, app/feed.xml/route.js and
 * the canonical-host redirects in next.config.js.
 *
 * The Aug 2026 audit found the build-time sitemap emitted exactly one URL,
 * `https://sac-website.vercel.app//gallery`: the wrong host, a double slash and
 * a route that no longer exists. These tests lock the replacement down.
 *
 * The app/ alias is not in jest.config.js moduleNameMapper, so these modules are
 * imported by relative path.
 */
import { ORIGIN } from '@/lib/seo'
import siteMetadata from '@/data/siteMetadata'

jest.mock('@/lib/articles', () => ({ listArticles: jest.fn() }))

import { listArticles } from '@/lib/articles'
import sitemap from '../../app/sitemap'
import robots from '../../app/robots'
import { GET as feedGET } from '../../app/feed.xml/route'

const nextConfig = require('../../next.config')

// jest-environment-jsdom exposes no fetch Response. The route handler builds one
// at call time, so a minimal shim installed here is enough.
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body
      this.status = init.status ?? 200
      this.headers = new Map(Object.entries(init.headers || {}))
    }

    async text() {
      return this.body
    }
  }
}

// Thirty-two articles: enough for three pages at POSTS_PER_PAGE = 15.
// Ordered newest-first, the way listArticles really returns them. Dates walk
// backwards from 2026-08-31 so every slug and date stays valid across the range.
const ARTICLE_COUNT = 32
const ARTICLES = Array.from({ length: ARTICLE_COUNT }, (_, i) => {
  const day = new Date(Date.UTC(2026, 7, 31 - i))
  const iso = day.toISOString().slice(0, 10)
  const n = ARTICLE_COUNT - i
  return {
    slug: `${iso.replace(/-/g, '/')}/articulo-${n}`,
    title: `Artículo ${n}`,
    summary: 'Resumen del artículo',
    date: `${iso}T08:00:00Z`,
    // A bare YYYY-MM-DD lastmod that precedes `date`: the exact shape that made
    // dateModified appear to precede datePublished across 62 of 77 articles.
    lastmod: iso,
    tags: ['Astronomía Observacional', 'Eclipses'],
  }
})

const PRIVATE_PATHS = ['/admin', '/member', '/api/', '/auth/', '/verify/', '/card-test-longname']

beforeEach(() => {
  jest.clearAllMocks()
  listArticles.mockResolvedValue({
    articles: ARTICLES,
    total: ARTICLES.length,
    page: 1,
    pageSize: 9999,
    totalPages: 1,
  })
})

describe('app/sitemap.js', () => {
  it('lists every published article by absolute URL', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const article of ARTICLES) {
      expect(urls).toContain(`${ORIGIN}/blog/${article.slug}`)
    }
  })

  it('includes the home page and the static marketing routes', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    const expected = [
      '/',
      '/blog',
      '/about',
      '/contact',
      '/donate',
      '/membership',
      '/events',
      '/guides',
      '/links',
      '/brand',
      '/weather',
      '/tags',
    ]
    for (const path of expected) {
      expect(urls).toContain(path === '/' ? ORIGIN : `${ORIGIN}${path}`)
    }
  })

  it('never emits a double slash', async () => {
    for (const entry of await sitemap()) {
      expect(entry.url.replace(/^https?:\/\//, '')).not.toContain('//')
    }
  })

  it('never emits the Vercel preview host', async () => {
    for (const entry of await sitemap()) {
      expect(entry.url).not.toContain('vercel.app')
      expect(entry.url.startsWith(`${ORIGIN}/`) || entry.url === ORIGIN).toBe(true)
    }
  })

  it('excludes /blog/page/1 but includes pages 2..N', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).not.toContain(`${ORIGIN}/blog/page/1`)
    // 32 articles at 15 per page => pages 1, 2, 3.
    expect(urls).toContain(`${ORIGIN}/blog/page/2`)
    expect(urls).toContain(`${ORIGIN}/blog/page/3`)
    expect(urls).not.toContain(`${ORIGIN}/blog/page/4`)
  })

  it('excludes every private and fixture route', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const path of [...PRIVATE_PATHS, '/api', '/auth', '/verify']) {
      const prefix = `${ORIGIN}${path.replace(/\/$/, '')}`
      expect(urls.some((u) => u === prefix || u.startsWith(`${prefix}/`))).toBe(false)
    }
  })

  it('emits tag pages with the same kebab-case slug the tag route uses', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    // github-slugger keeps the accent, so the live tag route does too.
    expect(urls).toContain(`${ORIGIN}/tags/astronomía-observacional`)
    expect(urls).toContain(`${ORIGIN}/tags/eclipses`)
  })

  it('deduplicates tag slugs shared across articles', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    const tagUrls = urls.filter((u) => u.startsWith(`${ORIGIN}/tags/`))
    expect(tagUrls).toHaveLength(2)
    expect(new Set(tagUrls).size).toBe(tagUrls.length)
  })

  it('emits no duplicate URLs at all', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('clamps lastModified so it can never precede the published date', async () => {
    const entries = await sitemap()
    for (const article of ARTICLES) {
      const entry = entries.find((e) => e.url === `${ORIGIN}/blog/${article.slug}`)
      expect(new Date(entry.lastModified).getTime()).toBeGreaterThanOrEqual(
        new Date(article.date).getTime()
      )
    }
  })

  it('ranks articles above tag pages', async () => {
    const entries = await sitemap()
    const article = entries.find((e) => e.url === `${ORIGIN}/blog/${ARTICLES[0].slug}`)
    const tag = entries.find((e) => e.url === `${ORIGIN}/tags/eclipses`)
    expect(article.priority).toBeGreaterThan(tag.priority)
  })

  it('gives every entry a changeFrequency and a priority in range', async () => {
    for (const entry of await sitemap()) {
      expect(typeof entry.changeFrequency).toBe('string')
      expect(entry.priority).toBeGreaterThan(0)
      expect(entry.priority).toBeLessThanOrEqual(1)
    }
  })

  it('still serves the static routes when the article index is unreachable', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    listArticles.mockRejectedValue(new Error('S3 unavailable'))

    const entries = await sitemap()

    expect(entries.length).toBeGreaterThan(0)
    expect(entries.map((e) => e.url)).toContain(`${ORIGIN}/blog`)
    expect(entries.every((e) => !e.url.includes('/tags/'))).toBe(true)
    spy.mockRestore()
  })

  it('skips articles that have no slug', async () => {
    listArticles.mockResolvedValue({ articles: [{ title: 'Sin slug', date: '2026-08-01' }] })
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.some((u) => u.startsWith(`${ORIGIN}/blog/2026`))).toBe(false)
  })
})

describe('app/robots.js', () => {
  const result = robots()
  const rule = result.rules[0]

  it('allows the whole site to every crawler', () => {
    expect(rule.userAgent).toBe('*')
    expect(rule.allow).toBe('/')
  })

  // robots.txt matches by prefix with no word boundary, so a bare '/member'
  // would also block '/membership', a public conversion page. Each private area
  // is anchored with $ and paired with a trailing-slash subtree rule.
  it('disallows every private and fixture route', () => {
    for (const path of PRIVATE_PATHS) {
      const bare = path.replace(/\/$/, '')
      const covered = rule.disallow.some((d) => d === bare || d === `${bare}$` || d === `${bare}/`)
      expect(covered).toBe(true)
    }
  })

  it('does not block /membership with the /member rule', () => {
    expect(rule.disallow).not.toContain('/member')
    expect(rule.disallow).toContain('/member$')
    expect(rule.disallow).toContain('/member/')
  })

  it('does not block /_next/, which Google needs to render the page', () => {
    expect(rule.disallow.some((p) => p.includes('_next'))).toBe(false)
  })

  it('names the sitemap by absolute URL', () => {
    expect(result.sitemap).toBe(`${ORIGIN}/sitemap.xml`)
    expect(result.sitemap).not.toContain('vercel.app')
    expect(result.sitemap.replace(/^https?:\/\//, '')).not.toContain('//')
  })

  it('does not use the obsolete host directive', () => {
    expect(result).not.toHaveProperty('host')
  })
})

describe('app/feed.xml/route.js', () => {
  it('emits absolute guid and link values on the canonical host', async () => {
    const xml = await (await feedGET()).text()
    for (const article of ARTICLES) {
      expect(xml).toContain(`<guid>${ORIGIN}/blog/${article.slug}</guid>`)
      expect(xml).toContain(`<link>${ORIGIN}/blog/${article.slug}</link>`)
    }
  })

  it('carries no double slash and no preview host anywhere', async () => {
    const xml = await (await feedGET()).text()
    expect(xml).not.toContain('vercel.app')
    const urls = xml.match(/https?:\/\/[^\s"<]+/g) || []
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url.replace(/^https?:\/\//, '')).not.toContain('//')
    }
  })

  it('points the channel link and the atom self link at the canonical host', async () => {
    const xml = await (await feedGET()).text()
    expect(xml).toContain(`<link>${ORIGIN}/blog</link>`)
    expect(xml).toContain(`href="${ORIGIN}/feed.xml"`)
  })

  it('is well-formed enough to parse, with one item per article', async () => {
    const xml = await (await feedGET()).text()
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(doc.getElementsByTagName('item')).toHaveLength(ARTICLES.length)
  })

  it('gives a lastBuildDate that cannot precede the newest pubDate', async () => {
    const xml = await (await feedGET()).text()
    const lastBuild = new Date(xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)[1])
    const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => new Date(m[1]))
    expect(Number.isNaN(lastBuild.getTime())).toBe(false)
    for (const pub of pubDates) {
      expect(lastBuild.getTime()).toBeGreaterThanOrEqual(pub.getTime())
    }
  })

  it('keeps lastBuildDate correct even if the index is not sorted newest-first', async () => {
    listArticles.mockResolvedValue({ articles: [...ARTICLES].reverse() })
    const xml = await (await feedGET()).text()
    const lastBuild = new Date(xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)[1])
    const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => new Date(m[1]))
    for (const pub of pubDates) {
      expect(lastBuild.getTime()).toBeGreaterThanOrEqual(pub.getTime())
    }
  })

  it('never emits an Invalid Date pubDate', async () => {
    listArticles.mockResolvedValue({ articles: [{ ...ARTICLES[0], date: 'not-a-date' }] })
    const xml = await (await feedGET()).text()
    expect(xml).not.toContain('Invalid Date')
  })
})

describe('next.config.js redirects', () => {
  let rules

  beforeAll(async () => {
    rules = await nextConfig.redirects()
  })

  it('redirects the Vercel preview host to the canonical origin, permanently', () => {
    const rule = rules.find((r) => (r.has || []).some((h) => h.type === 'host'))
    expect(rule).toBeDefined()
    expect(rule.has[0].value).toBe(siteMetadata.previewHost)
    expect(rule.source).toBe('/:path*')
    expect(rule.destination).toBe(`${ORIGIN}/:path*`)
    expect(rule.permanent).toBe(true)
  })

  it('redirects /blog/page/1 to /blog, permanently', () => {
    const rule = rules.find((r) => r.source === '/blog/page/1')
    expect(rule).toBeDefined()
    expect(rule.destination).toBe('/blog')
    expect(rule.permanent).toBe(true)
  })

  it('serves AVIF as well as WebP', () => {
    expect(nextConfig.images.formats).toEqual(['image/avif', 'image/webp'])
  })
})

describe('app/feed.xml/route.js', () => {
  it('emits absolute guid and link values on the canonical host', async () => {
    const xml = await (await feedGET()).text()
    for (const article of ARTICLES) {
      expect(xml).toContain(`<guid>${ORIGIN}/blog/${article.slug}</guid>`)
      expect(xml).toContain(`<link>${ORIGIN}/blog/${article.slug}</link>`)
    }
  })

  it('carries no double slash and no preview host anywhere', async () => {
    const xml = await (await feedGET()).text()
    expect(xml).not.toContain('vercel.app')
    const urls = xml.match(/https?:\/\/[^\s"<]+/g) || []
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url.replace(/^https?:\/\//, '')).not.toContain('//')
    }
  })

  it('points the channel link and the atom self link at the canonical host', async () => {
    const xml = await (await feedGET()).text()
    expect(xml).toContain(`<link>${ORIGIN}/blog</link>`)
    expect(xml).toContain(`href="${ORIGIN}/feed.xml"`)
  })

  it('is well-formed enough to parse, with one item per article', async () => {
    const xml = await (await feedGET()).text()
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(doc.getElementsByTagName('item')).toHaveLength(ARTICLES.length)
  })

  it('gives a lastBuildDate that cannot precede the newest pubDate', async () => {
    const xml = await (await feedGET()).text()
    const lastBuild = new Date(xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)[1])
    const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => new Date(m[1]))
    expect(Number.isNaN(lastBuild.getTime())).toBe(false)
    for (const pub of pubDates) {
      expect(lastBuild.getTime()).toBeGreaterThanOrEqual(pub.getTime())
    }
  })

  it('keeps lastBuildDate correct even if the index is not sorted newest-first', async () => {
    listArticles.mockResolvedValue({ articles: [...ARTICLES].reverse() })
    const xml = await (await feedGET()).text()
    const lastBuild = new Date(xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)[1])
    const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => new Date(m[1]))
    for (const pub of pubDates) {
      expect(lastBuild.getTime()).toBeGreaterThanOrEqual(pub.getTime())
    }
  })

  it('never emits an Invalid Date pubDate', async () => {
    listArticles.mockResolvedValue({ articles: [{ ...ARTICLES[0], date: 'not-a-date' }] })
    const xml = await (await feedGET()).text()
    expect(xml).not.toContain('Invalid Date')
  })
})

describe('next.config.js redirects', () => {
  let rules

  beforeAll(async () => {
    rules = await nextConfig.redirects()
  })

  it('redirects the Vercel preview host to the canonical origin, permanently', () => {
    const rule = rules.find((r) => (r.has || []).some((h) => h.type === 'host'))
    expect(rule).toBeDefined()
    expect(rule.has[0].value).toBe(siteMetadata.previewHost)
    expect(rule.source).toBe('/:path*')
    expect(rule.destination).toBe(`${ORIGIN}/:path*`)
    expect(rule.permanent).toBe(true)
  })

  it('redirects /blog/page/1 to /blog, permanently', () => {
    const rule = rules.find((r) => r.source === '/blog/page/1')
    expect(rule).toBeDefined()
    expect(rule.destination).toBe('/blog')
    expect(rule.permanent).toBe(true)
  })

  it('serves AVIF as well as WebP', () => {
    expect(nextConfig.images.formats).toEqual(['image/avif', 'image/webp'])
  })
})
