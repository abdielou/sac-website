import siteMetadata from '@/data/siteMetadata'
import {
  ORIGIN,
  absUrl,
  articleUrl,
  absoluteImages,
  toIso,
  safeModified,
  baseOpenGraph,
  baseTwitter,
  pageMetadata,
  noindexMetadata,
  organizationSchema,
  breadcrumbSchema,
  jsonLdScript,
} from '@/lib/seo'

describe('siteMetadata.siteUrl', () => {
  // The Aug 2026 audit: one trailing slash produced `https://host//path` in
  // og:url, the JSON-LD url, all 77 RSS links and the sitemap.
  it('has no trailing slash', () => {
    expect(siteMetadata.siteUrl).not.toMatch(/\/$/)
  })

  it('points at the production domain, not the Vercel preview host', () => {
    expect(siteMetadata.siteUrl).toBe('https://www.sociedadastronomia.com')
    expect(siteMetadata.siteUrl).not.toContain('vercel.app')
  })
})

describe('absUrl', () => {
  it('never produces a double slash', () => {
    for (const input of ['/blog', 'blog', '//blog', '/blog/2026/08/23/post']) {
      expect(absUrl(input)).not.toMatch(/[^:]\/\//)
    }
  })

  it('joins a leading-slash path correctly', () => {
    expect(absUrl('/blog')).toBe(`${ORIGIN}/blog`)
  })

  it('joins a bare path correctly', () => {
    expect(absUrl('blog')).toBe(`${ORIGIN}/blog`)
  })

  it('returns the origin for the root path', () => {
    expect(absUrl('/')).toBe(ORIGIN)
    expect(absUrl()).toBe(ORIGIN)
  })

  it('passes through an already-absolute URL', () => {
    expect(absUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(absUrl('http://example.com/a.png')).toBe('http://example.com/a.png')
  })
})

describe('articleUrl', () => {
  it('builds a blog URL from a bare slug', () => {
    expect(articleUrl('2026/08/23/post')).toBe(`${ORIGIN}/blog/2026/08/23/post`)
  })

  it('does not double the blog segment', () => {
    expect(articleUrl('blog/2026/08/23/post')).toBe(`${ORIGIN}/blog/2026/08/23/post`)
    expect(articleUrl('/blog/2026/08/23/post')).toBe(`${ORIGIN}/blog/2026/08/23/post`)
  })
})

describe('absoluteImages', () => {
  it('absolutizes a relative image path', () => {
    expect(absoluteImages(['/static/images/a.png'])).toEqual([`${ORIGIN}/static/images/a.png`])
  })

  it('absolutizes a relative path with no leading slash', () => {
    expect(absoluteImages(['static/images/a.png'])).toEqual([`${ORIGIN}/static/images/a.png`])
  })

  it('accepts a bare string', () => {
    expect(absoluteImages('/a.png')).toEqual([`${ORIGIN}/a.png`])
  })

  it('leaves absolute URLs alone', () => {
    const s3 = 'https://sac-blog-images.s3.amazonaws.com/a.jpg'
    expect(absoluteImages([s3])).toEqual([s3])
  })

  it('falls back to the social banner when there is no image', () => {
    const fallback = [absUrl(siteMetadata.socialBanner)]
    expect(absoluteImages([])).toEqual(fallback)
    expect(absoluteImages(undefined)).toEqual(fallback)
    expect(absoluteImages(null)).toEqual(fallback)
  })
})

describe('toIso and safeModified', () => {
  it('expands a bare date to a full ISO string', () => {
    expect(toIso('2024-03-01')).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back when the value is unparseable', () => {
    expect(toIso('not-a-date', '2024-03-01T08:00:00Z')).toBe('2024-03-01T08:00:00.000Z')
  })

  // 62 of 77 migrated articles store a bare-date lastmod against a T08:00:00Z
  // publish time, which made dateModified appear to precede datePublished.
  it('never returns a modified date before the published date', () => {
    const published = '2024-03-01T08:00:00Z'
    expect(safeModified(published, '2024-03-01')).toBe('2024-03-01T08:00:00.000Z')
  })

  it('keeps a genuinely later modified date', () => {
    const published = '2024-03-01T08:00:00Z'
    expect(safeModified(published, '2024-05-02T09:00:00Z')).toBe('2024-05-02T09:00:00.000Z')
  })

  it('falls back to the published date when lastmod is absent', () => {
    const published = '2024-03-01T08:00:00Z'
    expect(safeModified(published, undefined)).toBe('2024-03-01T08:00:00.000Z')
  })
})

describe('pageMetadata', () => {
  const meta = pageMetadata({
    title: 'Artículos',
    description: 'Todos los artículos',
    path: '/blog',
  })

  it('sets a self-referencing canonical', () => {
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/blog`)
  })

  it('keeps siteName and locale that a partial openGraph would have dropped', () => {
    expect(meta.openGraph.siteName).toBe(siteMetadata.title)
    expect(meta.openGraph.locale).toBe('es_PR')
  })

  it('always carries an og:image', () => {
    expect(meta.openGraph.images.length).toBeGreaterThan(0)
    expect(meta.openGraph.images[0].url).toMatch(/^https:\/\//)
  })

  it('keeps twitter:site', () => {
    expect(meta.twitter.site).toBe('@soc_astrocaribe')
  })

  it('sets og:url to the canonical', () => {
    expect(meta.openGraph.url).toBe(`${ORIGIN}/blog`)
  })

  it('does not bake the site name into the title (the template appends it)', () => {
    expect(meta.title).toBe('Artículos')
    expect(meta.title).not.toContain('SAC')
  })

  it('lets callers override base fields without losing the rest', () => {
    const article = pageMetadata({
      title: 'Post',
      path: '/blog/x',
      openGraph: { type: 'article', publishedTime: '2024-01-01T00:00:00Z' },
    })
    expect(article.openGraph.type).toBe('article')
    expect(article.openGraph.publishedTime).toBe('2024-01-01T00:00:00Z')
    expect(article.openGraph.siteName).toBe(siteMetadata.title)
    expect(article.openGraph.locale).toBe('es_PR')
  })

  it('omits robots unless asked', () => {
    expect(meta.robots).toBeUndefined()
  })
})

describe('noindexMetadata', () => {
  it('marks the page noindex, nofollow', () => {
    const meta = noindexMetadata({ title: 'Entrar', path: '/auth/signin' })
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
    expect(meta.robots.googleBot.index).toBe(false)
  })
})

describe('organizationSchema', () => {
  const org = organizationSchema()

  it('is an NGO with a stable @id', () => {
    expect(org['@type']).toBe('NGO')
    expect(org['@id']).toBe(`${ORIGIN}/#organization`)
  })

  it('uses an absolute logo URL', () => {
    expect(org.logo.url).toMatch(/^https:\/\//)
  })

  it('carries the Puerto Rico location signal', () => {
    expect(org.areaServed.name).toBe('Puerto Rico')
    expect(org.address.addressRegion).toBe('PR')
  })

  it('emits all four social profiles as sameAs', () => {
    expect(org.sameAs).toContain(siteMetadata.twitter)
    expect(org.sameAs).toContain(siteMetadata.facebook)
    expect(org.sameAs).toContain(siteMetadata.youtube)
    expect(org.sameAs).toContain(siteMetadata.instagram)
  })
})

describe('breadcrumbSchema', () => {
  it('numbers positions from 1 and absolutizes each item', () => {
    const crumbs = breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Artículos', path: '/blog' },
    ])
    expect(crumbs.itemListElement[0].position).toBe(1)
    expect(crumbs.itemListElement[1].position).toBe(2)
    expect(crumbs.itemListElement[1].item).toBe(`${ORIGIN}/blog`)
  })
})

describe('jsonLdScript', () => {
  it('escapes < so a title cannot close the script tag', () => {
    const out = jsonLdScript({ headline: 'a <script>alert(1)</script> b' })
    expect(out).not.toContain('<')
    expect(out).toContain('\\u003c')
  })

  it('escapes the JS line separators', () => {
    const out = jsonLdScript({ headline: `a b c` })
    expect(out).not.toContain(' ')
    expect(out).not.toContain(' ')
    expect(out).toContain('\\u2028')
    expect(out).toContain('\\u2029')
  })

  it('still round-trips as valid JSON', () => {
    const data = { headline: 'Cometa 220P/McNaught <observación>', tags: ['cometa'] }
    expect(JSON.parse(jsonLdScript(data))).toEqual(data)
  })
})

describe('baseOpenGraph and baseTwitter', () => {
  it('use absolute image URLs', () => {
    expect(baseOpenGraph.images[0].url).toMatch(/^https:\/\//)
    expect(baseTwitter.images[0]).toMatch(/^https:\/\//)
  })

  it('do not reference the preview host', () => {
    expect(baseOpenGraph.images[0].url).not.toContain('vercel.app')
    expect(baseTwitter.images[0]).not.toContain('vercel.app')
  })
})
