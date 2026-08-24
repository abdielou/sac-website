/**
 * SEO coverage for the root layout and the home page.
 *
 * The root layout is the only place that emits Organization markup, so the
 * Puerto Rico location signal and the four social profiles are asserted here.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import siteMetadata from '@/data/siteMetadata'
import { ORIGIN, ORGANIZATION_ID, jsonLdScript, organizationSchema } from '@/lib/seo'

// The layout imports global CSS, which Jest cannot resolve or parse.
jest.mock('@/css/tailwind.css', () => ({}), { virtual: true })
jest.mock('@/css/prism.css', () => ({}), { virtual: true })
jest.mock('../../app/providers', () => ({
  Providers: ({ children }) => children,
}))
// app/page.js only needs its metadata evaluated, not its data layer or its chrome.
jest.mock('@/lib/articles', () => ({ listArticles: jest.fn() }))
jest.mock('@/components/LayoutWrapper', () => ({
  __esModule: true,
  default: ({ children }) => children,
}))

import RootLayout, { metadata as rootMetadata } from '../../app/layout'
import { metadata as homeMetadata } from '../../app/page'
import HomeContent from '../../app/HomeContent'

// App files rely on Next's automatic JSX runtime, but the Jest transform compiles
// JSX with the classic runtime, which looks up a free `React` binding at render time.
globalThis.React = React

const layoutMarkup = renderToStaticMarkup(React.createElement(RootLayout, null))
const homeMarkup = renderToStaticMarkup(React.createElement(HomeContent, { posts: [] }))

const JSON_LD_RE = /<script type="application\/ld\+json">(.*?)<\/script>/gs

function jsonLdBlocks(markup) {
  return [...markup.matchAll(JSON_LD_RE)].map((m) => m[1])
}

describe('root layout metadata', () => {
  // Root metadata is INHERITED by every descendant segment that does not declare
  // its own. A canonical here would make each such route claim the home page as
  // its canonical, which is worse than having none at all. app/page.js emits the
  // home canonical itself through pageMetadata({ path: '/' }).
  it('declares no canonical, so descendants cannot inherit one', () => {
    expect(rootMetadata.alternates?.canonical).toBeUndefined()
  })

  it('points metadataBase at an origin that resolves without a double slash', () => {
    const resolved = new URL('/blog', rootMetadata.metadataBase).href
    expect(resolved).toBe(`${ORIGIN}/blog`)
    expect(resolved.replace(/^https:\/\//, '')).not.toContain('//')
  })

  it('points metadataBase at the production origin', () => {
    expect(rootMetadata.metadataBase.href).toContain('sociedadastronomia.com')
    expect(rootMetadata.metadataBase.href).not.toContain('vercel.app')
  })

  it('appends the site name through the title template, so routes must not repeat it', () => {
    expect(rootMetadata.title.template).toBe('%s | SAC')
    expect(rootMetadata.title.default).toBe(siteMetadata.title)
  })

  it('carries the shared OpenGraph base: siteName, locale and an absolute image', () => {
    expect(rootMetadata.openGraph.siteName).toBe(siteMetadata.title)
    expect(rootMetadata.openGraph.locale).toBe('es_PR')
    expect(rootMetadata.openGraph.type).toBe('website')
    expect(rootMetadata.openGraph.url).toBe(ORIGIN)
    expect(rootMetadata.openGraph.images[0].url).toMatch(/^https:\/\//)
  })

  it('carries the shared Twitter base with an absolute image', () => {
    expect(rootMetadata.twitter.card).toBe('summary_large_image')
    expect(rootMetadata.twitter.site).toBe('@soc_astrocaribe')
    expect(rootMetadata.twitter.images[0]).toMatch(/^https:\/\//)
  })

  it('stays indexable', () => {
    expect(rootMetadata.robots.index).toBe(true)
    expect(rootMetadata.robots.follow).toBe(true)
  })
})

describe('organization schema', () => {
  const schema = organizationSchema()

  it('is an NGO with the stable publisher @id', () => {
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('NGO')
    expect(schema['@id']).toBe(ORGANIZATION_ID)
    expect(schema.name).toBe(siteMetadata.title)
  })

  it('carries the Puerto Rico location signal', () => {
    expect(schema.areaServed.name).toBe('Puerto Rico')
    expect(schema.address.addressCountry).toBe('PR')
    expect(schema.address.addressRegion).toBe('PR')
  })

  it('lists the four configured social profiles in sameAs', () => {
    expect(schema.sameAs).toEqual([
      siteMetadata.twitter,
      siteMetadata.facebook,
      siteMetadata.youtube,
      siteMetadata.instagram,
    ])
    expect(schema.sameAs).toHaveLength(4)
  })

  it('uses absolute URLs everywhere', () => {
    expect(schema.url).toBe(ORIGIN)
    expect(schema.logo.url).toMatch(/^https:\/\//)
    expect(schema.image).toMatch(/^https:\/\//)
  })

  it('serializes to parseable JSON with no tag-closing characters', () => {
    const serialized = jsonLdScript(schema)
    expect(serialized).not.toContain('<')
    expect(() => JSON.parse(serialized)).not.toThrow()
    expect(JSON.parse(serialized)).toEqual(schema)
  })
})

describe('rendered root layout', () => {
  it('emits exactly one JSON-LD block and it parses', () => {
    const blocks = jsonLdBlocks(layoutMarkup)
    expect(blocks).toHaveLength(1)
    expect(() => JSON.parse(blocks[0])).not.toThrow()
  })

  it('emits the organization schema in the document', () => {
    const parsed = JSON.parse(jsonLdBlocks(layoutMarkup)[0])
    expect(parsed['@type']).toBe('NGO')
    expect(parsed['@id']).toBe(ORGANIZATION_ID)
    expect(parsed.sameAs).toHaveLength(4)
  })

  it('declares the Spanish document language', () => {
    expect(layoutMarkup).toContain('lang="es"')
  })

  it('preconnects to both Google Fonts hosts', () => {
    expect(layoutMarkup).toContain('href="https://fonts.googleapis.com"')
    expect(layoutMarkup).toContain('href="https://fonts.gstatic.com"')
  })

  it('does not hand-write a viewport meta tag, which Next injects', () => {
    expect(layoutMarkup).not.toContain('name="viewport"')
  })

  it('keeps the favicon, manifest and feed links', () => {
    expect(layoutMarkup).toContain('/static/favicons/site.webmanifest')
    expect(layoutMarkup).toContain('/static/favicons/favicon-32x32.png')
    expect(layoutMarkup).toContain('/feed.xml')
  })
})

describe('home page metadata', () => {
  it('has an absolute self-referencing canonical', () => {
    // absUrl('/') yields the bare origin; it resolves to the same document as `${ORIGIN}/`.
    expect(homeMetadata.alternates.canonical).toBe(ORIGIN)
    expect(new URL(homeMetadata.alternates.canonical).pathname).toBe('/')
  })

  it('does not repeat the site name the template already appends', () => {
    expect(homeMetadata.title).not.toContain('SAC')
    expect(homeMetadata.title).not.toContain(siteMetadata.title)
  })

  it('names Puerto Rico in the title', () => {
    expect(homeMetadata.title).toContain('Puerto Rico')
  })

  it('keeps the shared OpenGraph and Twitter bases', () => {
    expect(homeMetadata.openGraph.siteName).toBe(siteMetadata.title)
    expect(homeMetadata.openGraph.locale).toBe('es_PR')
    expect(homeMetadata.openGraph.url).toBe(ORIGIN)
    expect(homeMetadata.twitter.card).toBe('summary_large_image')
  })

  it('describes the organization', () => {
    expect(homeMetadata.description).toBe(siteMetadata.description)
  })
})

describe('home page heading', () => {
  const firstHeading = homeMarkup.match(/<h1[^>]*>(.*?)<\/h1>/s)

  it('renders a real h1', () => {
    expect(firstHeading).not.toBeNull()
  })

  it('names the organization and the island in that first h1', () => {
    expect(firstHeading[1]).toContain('Sociedad de Astronom')
    expect(firstHeading[1]).toContain('Puerto Rico')
  })

  it('places the h1 before any widget heading', () => {
    expect(homeMarkup.indexOf('Puerto Rico')).toBeLessThan(homeMarkup.indexOf('Manchas Solares'))
  })
})
