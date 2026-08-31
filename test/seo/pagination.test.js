// Blog listing and pagination: SEO remediation of 2026-08.
//
// Covers the numbered-pagination page-number maths, the /blog page-1 href rule,
// the positive-integer guard that turns soft 404s into real ones, and the
// paginated empty-state fallback in ListLayout.

import fs from 'fs'
import path from 'path'

import { ELLIPSIS, getPageNumbers, pageHref, parsePageParam } from '@/components/Pagination'
import { selectDisplayPosts } from '../../layouts/ListLayout'
import { POSTS_PER_PAGE } from '@/lib/blog-pagination'

const repoRoot = path.join(__dirname, '..', '..')
const readSource = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8')

const BLOG_PAGE = 'app/blog/page.js'
const SITEMAP = 'app/sitemap.js'
const BLOG_PAGE_N = path.join('app', 'blog', 'page', '[page]', 'page.js')

describe('getPageNumbers', () => {
  it('returns nothing when there are no pages', () => {
    expect(getPageNumbers(1, 0)).toEqual([])
    expect(getPageNumbers(1, -3)).toEqual([])
    expect(getPageNumbers(1, undefined)).toEqual([])
    expect(getPageNumbers(1, 'abc')).toEqual([])
  })

  it('lists every page when the archive is short', () => {
    expect(getPageNumbers(1, 6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(getPageNumbers(4, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('always shows the first and the last page', () => {
    const pages = getPageNumbers(10, 20)
    expect(pages[0]).toBe(1)
    expect(pages[pages.length - 1]).toBe(20)
  })

  it('shows the current page with two neighbours on each side', () => {
    const pages = getPageNumbers(10, 20)
    expect(pages).toEqual([1, ELLIPSIS, 8, 9, 10, 11, 12, ELLIPSIS, 20])
  })

  it('collapses a gap of more than one page into an ellipsis', () => {
    expect(getPageNumbers(1, 20)).toEqual([1, 2, 3, ELLIPSIS, 20])
    expect(getPageNumbers(20, 20)).toEqual([1, ELLIPSIS, 18, 19, 20])
  })

  it('renders a short gap in full instead of collapsing it', () => {
    // 1 .. 4,5,6,7,8 .. 10 hides only 2, 3 and 9, so render them as links.
    expect(getPageNumbers(6, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(getPageNumbers(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('keeps every page crawlable on the real 6-page archive', () => {
    for (let current = 1; current <= 6; current += 1) {
      expect(getPageNumbers(current, 6)).toEqual([1, 2, 3, 4, 5, 6])
    }
  })

  it('never repeats a page number', () => {
    for (let current = 1; current <= 20; current += 1) {
      const numbers = getPageNumbers(current, 20).filter((entry) => entry !== ELLIPSIS)
      expect(new Set(numbers).size).toBe(numbers.length)
    }
  })

  it('keeps page numbers in ascending order', () => {
    const numbers = getPageNumbers(9, 30).filter((entry) => entry !== ELLIPSIS)
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
  })

  it('never emits two ellipses in a row', () => {
    const pages = getPageNumbers(15, 40)
    pages.forEach((entry, index) => {
      if (entry === ELLIPSIS) expect(pages[index + 1]).not.toBe(ELLIPSIS)
    })
  })

  it('clamps an out-of-range current page into the real range', () => {
    expect(getPageNumbers(999, 6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(getPageNumbers(0, 6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(getPageNumbers(-5, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('accepts string page counts, as the route params supply them', () => {
    expect(getPageNumbers('2', '6')).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('honours a custom sibling count', () => {
    expect(getPageNumbers(10, 20, 0)).toEqual([1, ELLIPSIS, 10, ELLIPSIS, 20])
    expect(getPageNumbers(10, 20, 1)).toEqual([1, ELLIPSIS, 9, 10, 11, ELLIPSIS, 20])
  })
})

describe('pageHref', () => {
  it('sends page 1 to /blog, not /blog/page/1', () => {
    expect(pageHref(1)).toBe('/blog')
    expect(pageHref('1')).toBe('/blog')
  })

  it('sends every other page to /blog/page/N', () => {
    expect(pageHref(2)).toBe('/blog/page/2')
    expect(pageHref('16')).toBe('/blog/page/16')
  })

  it('falls back to /blog for junk input', () => {
    expect(pageHref('abc')).toBe('/blog')
    expect(pageHref(undefined)).toBe('/blog')
  })

  it('never builds a double slash', () => {
    for (let page = 1; page <= 10; page += 1) {
      expect(pageHref(page)).not.toMatch(/\/\//)
    }
  })
})

describe('parsePageParam', () => {
  it('accepts a positive integer', () => {
    expect(parsePageParam('1')).toBe(1)
    expect(parsePageParam('16')).toBe(16)
    expect(parsePageParam(3)).toBe(3)
  })

  it('rejects every value that would produce a soft 404', () => {
    // /blog/page/999 used to answer 200 and render all 77 articles.
    const bad = ['0', '-1', '01', '1.5', '1e3', 'abc', '', ' 2', '2 ', null, undefined, NaN, {}]
    bad.forEach((value) => expect(parsePageParam(value)).toBeNull())
  })
})

describe('selectDisplayPosts', () => {
  const filteredBlogPosts = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
  const initialDisplayPosts = [{ slug: 'a' }]

  it('renders the page slice on a paginated view', () => {
    expect(selectDisplayPosts({ initialDisplayPosts, filteredBlogPosts, paginated: true })).toEqual(
      initialDisplayPosts
    )
  })

  it('renders an empty paginated page empty, never the whole corpus', () => {
    // The soft-404 amplifier: an empty page used to fall through to every post.
    expect(
      selectDisplayPosts({ initialDisplayPosts: [], filteredBlogPosts, paginated: true })
    ).toEqual([])
  })

  it('keeps the full list for an unpaginated view such as /tags/[tag]', () => {
    expect(selectDisplayPosts({ initialDisplayPosts: [], filteredBlogPosts })).toEqual(
      filteredBlogPosts
    )
  })

  it('shows search results even on a paginated view', () => {
    expect(
      selectDisplayPosts({
        initialDisplayPosts,
        filteredBlogPosts,
        searchValue: 'luna',
        paginated: true,
      })
    ).toEqual(filteredBlogPosts)
  })

  it('returns an empty list when called with nothing', () => {
    expect(selectDisplayPosts()).toEqual([])
  })
})

describe('blog listing routes', () => {
  const blogPage = readSource(BLOG_PAGE)
  const blogPageN = readSource(BLOG_PAGE_N)

  // The page size used to be a separate literal in three files. When it went
  // from 5 to 15 the sitemap kept emitting /blog/page/2..16 while the routes
  // only served 6 pages, putting ten 404s in the sitemap. It now lives in
  // lib/blog-pagination.js and every consumer imports it.
  it('imports the page size instead of redeclaring it', () => {
    for (const source of [blogPage, blogPageN]) {
      expect(source).toMatch(/from '@\/lib\/blog-pagination'/)
      expect(source).not.toMatch(/const POSTS_PER_PAGE\s*=\s*\d+/)
    }
  })

  it('has exactly one declaration of the page size in the whole repo', () => {
    expect(POSTS_PER_PAGE).toBe(15)
    const declarations = [blogPage, blogPageN, readSource(SITEMAP)].filter((source) =>
      /(const|let|var)\s+POSTS_PER_PAGE\s*=\s*\d+/.test(source)
    )
    expect(declarations).toHaveLength(0)
  })

  it('keeps the sitemap in step with the routes', () => {
    expect(readSource(SITEMAP)).toMatch(/from '@\/lib\/blog-pagination'/)
  })

  it('does not bake the site name into the title, the template appends it', () => {
    // The old titles rendered as 'Artículos | SAC | SAC'.
    expect(blogPage).not.toMatch(/title:\s*`Artículos \|/)
    expect(blogPageN).not.toMatch(/title:\s*`Artículos \|/)
    expect(blogPage).not.toMatch(/siteMetadata\.author/)
    expect(blogPageN).not.toMatch(/siteMetadata\.author/)
  })

  it('builds metadata through the shared helper, so each page gets a canonical', () => {
    expect(blogPage).toMatch(/pageMetadata\(/)
    expect(blogPageN).toMatch(/export async function generateMetadata/)
    expect(blogPageN).toMatch(/pageMetadata\(/)
  })

  it('gives the paginated route a distinct title per page', () => {
    expect(blogPageN).toMatch(/Artículos, página \$\{pageNumber\}/)
  })

  it('guards the paginated route with notFound', () => {
    expect(blogPageN).toMatch(/import \{ notFound \} from 'next\/navigation'/)
    expect(blogPageN).toMatch(/notFound\(\)/)
    expect(blogPageN).toMatch(/parsePageParam/)
  })

  it('marks both listings as paginated so an empty page cannot fall through', () => {
    expect(blogPage).toMatch(/paginated/)
    expect(blogPageN).toMatch(/paginated/)
  })
})

describe('user-facing copy', () => {
  const pagination = readSource(path.join('components', 'Pagination.js'))
  const listLayout = readSource(path.join('layouts', 'ListLayout.js'))

  it('is in Spanish', () => {
    expect(pagination).toContain('Anterior')
    expect(pagination).toContain('Siguiente')
    expect(pagination).toContain('Página')
    expect(pagination).not.toContain('>Previous<')
    expect(pagination).not.toContain('>Next<')
    expect(listLayout).toContain('No se encontraron artículos.')
    expect(listLayout).not.toContain('No posts found.')
  })

  it('labels the pagination nav and marks the current page', () => {
    expect(pagination).toMatch(/aria-label="Paginación de artículos"/)
    expect(pagination).toMatch(/aria-current=/)
  })
})
