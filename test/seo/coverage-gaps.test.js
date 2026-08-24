/**
 * Gaps found when auditing the SEO remediation against the original findings.
 *
 * Each of these was reported as fixed, or assumed fixed, but was not. They are
 * pinned here so they cannot regress quietly a second time.
 */
import fs from 'fs'
import path from 'path'

import { assertPublishable } from '@/lib/articles'

const repoRoot = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

describe('home page has exactly one h1', () => {
  // The remediation added an h1 to HomeContent but left two more in the widgets,
  // so the page still shipped three competing h1 elements.
  const sources = {
    'app/HomeContent.js': read('app/HomeContent.js'),
    'components/widgets/ApodWidget.js': read('components/widgets/ApodWidget.js'),
    'components/widgets/ImageWidget.js': read('components/widgets/ImageWidget.js'),
  }

  it('declares its single h1 in HomeContent, not in a widget', () => {
    expect(sources['app/HomeContent.js'].match(/<h1[\s>]/g) || []).toHaveLength(1)
  })

  it('uses h2 for the widget headings', () => {
    expect(sources['components/widgets/ApodWidget.js']).not.toMatch(/<h1[\s>]/)
    expect(sources['components/widgets/ImageWidget.js']).not.toMatch(/<h1[\s>]/)
  })

  it('names the organisation and Puerto Rico in the h1', () => {
    const h1 = sources['app/HomeContent.js'].match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    expect(h1).not.toBeNull()
    expect(h1[1]).toMatch(/Puerto Rico|Caribe/i)
  })
})

describe('no mixed content', () => {
  // Plain http:// resources on an https page are blocked by the browser and
  // were the source of several broken weather images.
  it('data/weatherData.js uses https everywhere', () => {
    expect(read('data/weatherData.js')).not.toMatch(/http:\/\//)
  })
})

describe('raw <img> fallback in Card', () => {
  // Without loading="lazy" Next preloads every one of these, which put ten
  // <link rel=preload> tags for weather images into the head of /weather.
  it('sets loading and decoding on the unoptimised branch', () => {
    const src = read('components/Card.js')
    expect(src).toMatch(/loading="lazy"/)
    expect(src).toMatch(/decoding="async"/)
  })
})

describe('article JSON-LD author', () => {
  it('links the author to their profile page', () => {
    const src = read('app/blog/[...slug]/page.js')
    expect(src).toMatch(/node\.url = absUrl\(`\/authors\/\$\{author\.slug\}`\)/)
  })

  it('does not link the organisation-level default author', () => {
    const src = read('app/blog/[...slug]/page.js')
    expect(src).toMatch(/author\.slug !== 'default'/)
  })
})

describe('/about links to the author pages', () => {
  it('threads the slug through to the profile card', () => {
    expect(read('app/about/page.js')).toMatch(/slug/)
    expect(read('layouts/AuthorListLayout.js')).toMatch(/\/authors\/\$\{slug\}/)
  })

  it('gives the avatar a real alt instead of "avatar"', () => {
    expect(read('layouts/AuthorListLayout.js')).not.toMatch(/alt="avatar"/)
  })
})

describe('Pages Router language', () => {
  it('declares Spanish, matching the App Router', () => {
    expect(read('pages/_document.js')).toMatch(/<Html lang="es">/)
  })
})

describe('unused build dependency', () => {
  // globby existed only for scripts/generate-sitemap.js, which was deleted.
  it('globby is gone from package.json', () => {
    expect(read('package.json')).not.toMatch(/"globby"/)
  })
})

describe('assertPublishable', () => {
  // The editor gate is client-side; a direct API call bypassed it, which is how
  // 13 untagged articles were published.
  it('rejects a published article with no tags', () => {
    expect(() => assertPublishable({ draft: false, tags: [] })).toThrow(/al menos una etiqueta/)
    expect(() => assertPublishable({ draft: false })).toThrow(/al menos una etiqueta/)
  })

  it('rejects tags that are only whitespace', () => {
    expect(() => assertPublishable({ draft: false, tags: ['', '  '] })).toThrow()
  })

  it('accepts a published article with a real tag', () => {
    expect(() => assertPublishable({ draft: false, tags: ['cometa'] })).not.toThrow()
  })

  it('leaves drafts alone', () => {
    expect(() => assertPublishable({ draft: true, tags: [] })).not.toThrow()
    expect(() => assertPublishable({ tags: [] })).not.toThrow()
  })
})

describe('listing payload projection', () => {
  const { toSearchIndex, SEARCH_INDEX_FIELDS, listingTitle } = require('@/lib/blog-pagination')

  const full = {
    slug: '2026/01/01/x',
    title: 'T',
    summary: 'S',
    tags: ['cometa'],
    date: '2026-01-01T08:00:00Z',
    images: ['/a.png'],
    imgWidth: 100,
    imgHeight: 50,
    // Fields the client never reads, previously shipped to every visitor.
    lastmod: '2026-01-02T00:00:00Z',
    authors: ['eddie'],
    draft: false,
    archived: false,
  }

  it('keeps only the fields the client actually renders', () => {
    const [entry] = toSearchIndex([full])
    expect(Object.keys(entry).sort()).toEqual([...SEARCH_INDEX_FIELDS].sort())
  })

  it('drops the fields nothing reads', () => {
    const [entry] = toSearchIndex([full])
    for (const dropped of ['lastmod', 'authors', 'draft', 'archived']) {
      expect(entry).not.toHaveProperty(dropped)
    }
  })

  it('always gives tags an array, since search joins it unconditionally', () => {
    const [entry] = toSearchIndex([{ slug: 'a', title: 'b' }])
    expect(Array.isArray(entry.tags)).toBe(true)
  })

  it('tolerates an empty or missing list', () => {
    expect(toSearchIndex([])).toEqual([])
    expect(toSearchIndex()).toEqual([])
  })
})

describe('listingTitle', () => {
  const { listingTitle } = require('@/lib/blog-pagination')

  it('leaves page 1 unqualified', () => {
    expect(listingTitle(1)).toBe('Artículos')
    expect(listingTitle()).toBe('Artículos')
  })

  it('gives every later page a distinct h1', () => {
    // All 16 paginated pages previously rendered the same <h1>Artículos</h1>.
    expect(listingTitle(2)).toBe('Artículos, página 2')
    expect(listingTitle(6)).toBe('Artículos, página 6')
    expect(new Set([1, 2, 3, 4, 5, 6].map(listingTitle)).size).toBe(6)
  })
})

describe('markFirstImagePriority', () => {
  const { markFirstImagePriority } = require('@/lib/blog-pagination')

  it('marks the first Image as the LCP candidate', () => {
    const out = markFirstImagePriority('<Image alt="a" width="800" height="600" src="/a.jpg" />')
    expect(out).toMatch(/priority/)
    expect(out).toMatch(/fetchPriority="high"/)
  })

  it('touches only the first image', () => {
    const src = '<Image alt="a" src="/a.jpg" />\ntext\n<Image alt="b" src="/b.jpg" />'
    const out = markFirstImagePriority(src)
    expect((out.match(/priority/g) || []).length).toBe(1)
  })

  it('leaves an author-supplied priority alone', () => {
    const src = '<Image alt="a" priority src="/a.jpg" />'
    expect(markFirstImagePriority(src)).toBe(src)
  })

  it('is a no-op on a body with no images', () => {
    expect(markFirstImagePriority('just prose')).toBe('just prose')
    expect(markFirstImagePriority('')).toBe('')
    expect(markFirstImagePriority(undefined)).toBe('')
  })

  it('produces valid JSX, not a broken tag', () => {
    const out = markFirstImagePriority('<Image alt="a" src="/a.jpg" />')
    expect(out).toMatch(/\/>$/)
    expect(out).not.toMatch(/\/\s*>\s*\S/)
  })
})

describe('tag pages have breadcrumbs', () => {
  it('emits BreadcrumbList and a visible trail back to /tags', () => {
    const src = read('app/tags/[tag]/page.js')
    expect(src).toMatch(/breadcrumbSchema/)
    expect(src).toMatch(/Ruta de navegación/)
    expect(src).toMatch(/path: '\/tags'/)
  })
})

describe('Image priority on the raw <img> fallback', () => {
  // Many article bodies declare no width/height, so the fallback branch renders
  // the LCP image. Hardcoding loading="lazy" there deferred it regardless of
  // the priority flag the MDX transform had just added.
  it('renders eager when priority is set', () => {
    const src = read('components/Image.js')
    expect(src).toMatch(/priority \? 'eager' : loading \|\| 'lazy'/)
  })

  it('still lazy-loads everything else', () => {
    const src = read('components/Image.js')
    expect(src).toMatch(/loading \|\| 'lazy'/)
  })
})
