/**
 * Guards the removal of the dead SEO subsystem.
 *
 * Two SEO systems used to coexist: the live App Router `metadata` exports, and
 * an orphaned Pages Router stack (`layouts/PostLayout.js`, `layouts/PostSimple.js`,
 * `layouts/AuthorLayout.js`, `lib/generate-rss.js`) that nothing imported. The
 * dead half was the half that carried a canonical, which is why the live pages
 * had none and why the duplication was actively misleading.
 *
 * The tree walk below is the real value of this file: it fails if any of those
 * modules is ever imported again, so the dead subsystem cannot creep back.
 */
import fs from 'fs'
import path from 'path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ORIGIN } from '@/lib/seo'
import siteMetadata from '@/data/siteMetadata'

// The Jest transform compiles JSX with the classic runtime, which looks up a
// free `React` binding at render time.
globalThis.React = React

const REPO_ROOT = path.resolve(__dirname, '..', '..')

/** Module basenames that must never be imported again. */
const DEAD_MODULES = ['PostLayout', 'PostSimple', 'AuthorLayout', 'generate-rss']

/** Files that were deleted, relative to the repo root. */
const DELETED_PATHS = [
  'layouts/PostLayout.js',
  'layouts/PostSimple.js',
  'layouts/AuthorLayout.js',
  'lib/generate-rss.js',
]

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.planning',
  '.vercel',
  '.swc',
  '.sawyer',
  'coverage',
  'out',
  'build',
  'public',
  'venv',
  'venv310',
])

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])

/** Every `from '...'`, `require('...')` and `import('...')` specifier. */
const SPECIFIER_RE = /(?:from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g

function collectSourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectSourceFiles(path.join(dir, entry.name), found)
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(path.join(dir, entry.name))
    }
  }
  return found
}

/** Import specifiers in `source` that resolve to one of the dead modules. */
function deadImports(source) {
  const hits = []
  for (const match of source.matchAll(SPECIFIER_RE)) {
    const specifier = match[1]
    const basename = path.basename(specifier).replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, '')
    if (DEAD_MODULES.includes(basename)) hits.push(specifier)
  }
  return hits
}

const sourceFiles = collectSourceFiles(REPO_ROOT)

describe('dead SEO subsystem removal', () => {
  it('walks a real source tree, so the import check cannot pass vacuously', () => {
    expect(sourceFiles.length).toBeGreaterThan(50)
    expect(sourceFiles).toContain(path.join(REPO_ROOT, 'components', 'SEO.js'))
    expect(sourceFiles).toContain(path.join(REPO_ROOT, 'pages', 'gallery.js'))
  })

  it.each(DELETED_PATHS)('no longer ships %s', (relative) => {
    expect(fs.existsSync(path.join(REPO_ROOT, relative))).toBe(false)
  })

  it('is not imported by any source file in the repo', () => {
    const offenders = []
    for (const file of sourceFiles) {
      // This suite carries dead-import fixtures on purpose; see the test below.
      if (file === __filename) continue
      const hits = deadImports(fs.readFileSync(file, 'utf8'))
      for (const hit of hits) offenders.push(`${path.relative(REPO_ROOT, file)} -> ${hit}`)
    }
    expect(offenders).toEqual([])
  })

  it('detects a dead import when one exists, so the walk is not a no-op', () => {
    expect(deadImports("import PostLayout from '@/layouts/PostLayout'")).toEqual([
      '@/layouts/PostLayout',
    ])
    expect(deadImports("const rss = require('../lib/generate-rss.js')")).toEqual([
      '../lib/generate-rss.js',
    ])
    expect(deadImports("import { absUrl } from '@/lib/seo'")).toEqual([])
  })

  it('leaves no stale per-tag RSS tree or root feed in public/', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'public', 'tags'))).toBe(false)
    expect(fs.existsSync(path.join(REPO_ROOT, 'public', 'feed.xml'))).toBe(false)
  })

  it('serves the live feed from the App Router route instead', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'app', 'feed.xml', 'route.js'))).toBe(true)
  })
})

describe('components/SEO.js', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'components', 'SEO.js'), 'utf8')

  it('exports only PageSEO, the one helper the Pages Router still needs', () => {
    const seo = require('@/components/SEO')
    expect(Object.keys(seo).sort()).toEqual(['PageSEO'])
  })

  it('drops the duplicate Article schema that shadowed the live one', () => {
    // Match declarations, not the prose in the file's header comment.
    expect(source).not.toMatch(/export\s+(?:const|function)\s+BlogSEO/)
    expect(source).not.toMatch(/export\s+(?:const|function)\s+TagSEO/)
    expect(source).not.toContain("'@type': 'Article'")
    expect(source).not.toContain('application/ld+json')
  })

  it('builds URLs through lib/seo rather than concatenating siteUrl', () => {
    expect(source).toContain("from '@/lib/seo'")
    expect(source).not.toContain('siteMetadata.siteUrl')
  })

  it('has no page left importing it other than the gallery', () => {
    const importers = sourceFiles.filter((file) => {
      // This suite requires the module itself, and SEO.js cannot import itself.
      if (file === __filename) return false
      if (file === path.join(REPO_ROOT, 'components', 'SEO.js')) return false
      const text = fs.readFileSync(file, 'utf8')
      return /(?:from\s*|require\(\s*)['"][^'"]*components\/SEO['"]/.test(text)
    })
    const relative = importers.map((file) => path.relative(REPO_ROOT, file).replace(/\\/g, '/'))
    expect(relative).toEqual(['pages/gallery.js'])
  })
})

describe('PageSEO output', () => {
  // next/head renders nothing outside a Next app; pass its children straight through.
  jest.mock('next/head', () => ({ __esModule: true, default: ({ children }) => children }))
  jest.mock('next/router', () => ({ useRouter: () => ({ asPath: '/gallery?year=2025#top' }) }))

  const { PageSEO } = require('@/components/SEO')
  const markup = renderToStaticMarkup(
    React.createElement(PageSEO, { title: 'Galería de Fotos', description: 'Fotos del club.' })
  )

  it('renders a title that carries the same site-name suffix as the App Router', () => {
    expect(markup).toContain('<title>Galería de Fotos | SAC</title>')
  })

  it('emits a self-referencing absolute canonical', () => {
    expect(markup).toContain(`<link rel="canonical" href="${ORIGIN}/gallery"/>`)
  })

  it('strips the query and the hash, so one page cannot claim several canonicals', () => {
    expect(markup).not.toContain('year=2025')
    expect(markup).not.toContain('#top')
  })

  it('never produces a double slash in any absolute URL', () => {
    for (const [, url] of markup.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
      expect(url.replace(/^https?:\/\//, '')).not.toContain('//')
    }
  })

  it('points og:url at the canonical and og:image at an absolute banner', () => {
    expect(markup).toContain(`<meta property="og:url" content="${ORIGIN}/gallery"/>`)
    expect(markup).toContain(`content="${ORIGIN}${siteMetadata.socialBanner}"`)
  })

  it('uses the twitter handle, not the profile URL, for twitter:site', () => {
    expect(markup).toContain('<meta name="twitter:site" content="@soc_astrocaribe"/>')
    expect(markup).not.toContain('name="twitter:site" content="https://')
  })

  it('declares the Spanish locale', () => {
    expect(markup).toContain('<meta property="og:locale" content="es_PR"/>')
  })
})

describe('pages/gallery.js', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'pages', 'gallery.js'), 'utf8')
  const title = source.match(/title="([^"]+)"/)?.[1]
  const description = source.match(/description="([^"]+)"/)?.[1]

  it('gives the page a descriptive title', () => {
    expect(title).toBeDefined()
    expect(title.length).toBeGreaterThan(10)
  })

  it('does not bake the site name into the title, because PageSEO appends it', () => {
    expect(title).not.toMatch(/\bSAC\b/)
    expect(title).not.toContain(siteMetadata.title)
  })

  it('gives the page a real description instead of a three-word placeholder', () => {
    expect(description).toBeDefined()
    expect(description.length).toBeGreaterThan(70)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).not.toBe('Galería de imágenes')
  })
})
