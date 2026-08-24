/**
 * SEO coverage for every non-blog public route.
 *
 * Next assigns rather than merges nested metadata objects, so a route that
 * declared a partial `openGraph` used to emit no og:image, og:url, og:site_name,
 * og:locale or og:type at all. Every route below now routes through
 * `pageMetadata`, so the shared assertions check the whole block at once.
 *
 * The root layout applies the title template '%s | SAC', so no route title may
 * contain the site name itself.
 */

// `@/layouts/*` and `@/css/*` have no jest moduleNameMapper entry, and the data
// layers (MDX, S3, Google Sheets, Auth.js) must never be reached from a metadata
// test, so everything the page modules pull in is mocked here.
jest.mock('@/lib/mdx', () => ({ getFileBySlug: jest.fn() }))
jest.mock('@/lib/media-s3', () => ({ getMediaEntry: jest.fn() }))
jest.mock('@/lib/google-sheets', () => ({ getMembers: jest.fn() }))
jest.mock('../../auth', () => ({
  signIn: jest.fn(),
  auth: jest.fn(),
  devBypassEnabled: false,
}))
jest.mock('next/image', () => () => null)
jest.mock('next/link', () => () => null)
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
jest.mock(
  '@/components/LayoutWrapper',
  () =>
    ({ children }) =>
      children
)
jest.mock('@/components/Link', () => () => null)
jest.mock('@/components/Image', () => () => null)
jest.mock('@/components/PageTitle', () => () => null)
jest.mock('@/components/Card', () => () => null)
jest.mock('@/components/MediaPlayer', () => () => null)
jest.mock('@/components/social-icons', () => () => null)
jest.mock('../../app/about/AboutContent', () => () => null)
jest.mock('../../app/donate/DonateContent', () => () => null)
jest.mock('../../app/membership/MembershipContent', () => () => null)

import React from 'react'
import { notFound } from 'next/navigation'
import { getMediaEntry } from '@/lib/media-s3'
import { getMembers } from '@/lib/google-sheets'
import siteMetadata from '@/data/siteMetadata'
import { ORIGIN } from '@/lib/seo'
import { metadata as aboutMetadata } from '../../app/about/page'
import { metadata as brandMetadata } from '../../app/brand/page'
import { metadata as contactMetadata } from '../../app/contact/page'
import { metadata as eventsMetadata } from '../../app/events/page'
import { metadata as weatherMetadata } from '../../app/weather/page'
import { metadata as linksMetadata } from '../../app/links/page'
import { metadata as donateMetadata } from '../../app/donate/page'
import { metadata as membershipMetadata } from '../../app/membership/page'
import { metadata as signinMetadata } from '../../app/auth/signin/page'
import { metadata as authErrorMetadata } from '../../app/auth/error/page'
import MediaPage, { generateMetadata as mediaMetadata } from '../../app/media/[slug]/page'
import { generateMetadata as verifyMetadata } from '../../app/verify/[token]/page'

const PRODUCTION_HOST = new URL(siteMetadata.siteUrl).host

// babel-jest compiles JSX with the classic runtime, so React must be in scope
// when a page component is invoked directly.
global.React = React

/** OpenGraph images accept a bare URL or an { url } object; normalize both. */
function firstImageUrl(images) {
  const first = Array.isArray(images) ? images[0] : images
  return typeof first === 'string' ? first : first?.url
}

const entry = {
  slug: 'observacion-lunar',
  title: 'Observación lunar desde Arecibo',
  description: 'Video de una observación lunar.',
  thumbnail: 'https://sac-gallery.s3.amazonaws.com/media/observacion-lunar.jpg',
  publishedAt: '2026-05-07T12:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('every non-blog public route', () => {
  // [label, metadata, canonical path]
  const routes = [
    ['about', aboutMetadata, '/about'],
    ['brand', brandMetadata, '/brand'],
    ['contact', contactMetadata, '/contact'],
    ['events', eventsMetadata, '/events'],
    ['weather', weatherMetadata, '/weather'],
    ['links', linksMetadata, '/links'],
    ['donate', donateMetadata, '/donate'],
    ['membership', membershipMetadata, '/membership'],
    ['auth/signin', signinMetadata, '/auth/signin'],
    ['auth/error', authErrorMetadata, '/auth/error'],
  ]

  it.each(routes)('%s declares a self-referencing canonical', (_label, meta, path) => {
    expect(meta.alternates.canonical).toBe(`${ORIGIN}${path}`)
  })

  it.each(routes)('%s puts the canonical on the production host', (_label, meta) => {
    const url = new URL(meta.alternates.canonical)
    expect(url.host).toBe(PRODUCTION_HOST)
    expect(url.protocol).toBe('https:')
    expect(url.pathname).not.toContain('//')
  })

  it.each(routes)('%s emits an absolute og:image', (_label, meta) => {
    const image = firstImageUrl(meta.openGraph.images)
    expect(image).toBeTruthy()
    expect(image).toMatch(/^https:\/\//)
  })

  it.each(routes)('%s emits og:site_name, og:locale, og:type and og:url', (_label, meta, path) => {
    expect(meta.openGraph.siteName).toBe(siteMetadata.title)
    expect(meta.openGraph.locale).toBe('es_PR')
    expect(meta.openGraph.type).toBeTruthy()
    expect(meta.openGraph.url).toBe(`${ORIGIN}${path}`)
  })

  it.each(routes)('%s carries a complete twitter card', (_label, meta) => {
    expect(meta.twitter.card).toBe('summary_large_image')
    expect(firstImageUrl(meta.twitter.images)).toMatch(/^https:\/\//)
    expect(meta.twitter.title).toBe(meta.title)
  })

  it.each(routes)('%s keeps the site name out of the title', (_label, meta) => {
    expect(meta.title).toBeTruthy()
    expect(meta.title).not.toMatch(/SAC/i)
    expect(meta.title).not.toMatch(/Sociedad de Astronom/i)
    expect(meta.title).not.toContain('|')
    expect(meta.title).not.toContain(' - ')
  })

  it.each(routes)('%s writes a real Spanish description, not the site default', (_label, meta) => {
    expect(meta.description.length).toBeGreaterThan(40)
    expect(meta.description).not.toBe(siteMetadata.description)
  })
})

describe('descriptions describe the page that was actually built', () => {
  it('contact lists the published email and both phone numbers', () => {
    expect(contactMetadata.description).toContain(siteMetadata.email)
    expect(contactMetadata.description).toContain('787) 380-3444')
    expect(contactMetadata.description).toContain('787) 247-2244')
  })

  it('donate names both payment rails on the page', () => {
    expect(donateMetadata.description).toMatch(/ATH M[oó]vil/)
    expect(donateMetadata.description).toContain('PayPal')
    expect(donateMetadata.description).toContain('501(c)(3)')
  })

  it('membership mentions the membership fee the page body states', () => {
    expect(membershipMetadata.description).toMatch(/cuota de membres[ií]a/i)
  })

  it('about mentions the board of directors both tabs show', () => {
    expect(aboutMetadata.description).toMatch(/Junta de Directores/i)
    expect(aboutMetadata.description).toContain('2021-2024')
  })
})

describe('noindex routes', () => {
  it('marks /auth/signin noindex, nofollow', () => {
    expect(signinMetadata.robots.index).toBe(false)
    expect(signinMetadata.robots.follow).toBe(false)
    expect(signinMetadata.robots.googleBot.index).toBe(false)
  })

  it('marks /auth/error noindex, nofollow', () => {
    expect(authErrorMetadata.robots.index).toBe(false)
    expect(authErrorMetadata.robots.follow).toBe(false)
    expect(authErrorMetadata.robots.googleBot.index).toBe(false)
  })

  it('marks /verify/<token> noindex and canonicalises to the token viewed', async () => {
    const meta = await verifyMetadata({ params: Promise.resolve({ token: 'abc123' }) })
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/verify/abc123`)
    expect(meta.title).not.toMatch(/SAC/i)
    expect(new URL(meta.alternates.canonical).host).toBe(PRODUCTION_HOST)
  })

  it('builds the verify head without reading the member sheet, so no PII can leak', async () => {
    const meta = await verifyMetadata({ params: Promise.resolve({ token: 'abc123' }) })
    expect(getMembers).not.toHaveBeenCalled()
    expect(meta.description).toBe(
      'Verificación de membresía de la Sociedad de Astronomía del Caribe.'
    )
  })

  it('leaves the indexable routes indexable', () => {
    for (const meta of [aboutMetadata, donateMetadata, membershipMetadata, weatherMetadata]) {
      expect(meta.robots).toBeUndefined()
    }
  })
})

describe('/media/<slug>', () => {
  const params = Promise.resolve({ slug: 'observacion-lunar' })

  it('canonicalises to its own permalink', async () => {
    getMediaEntry.mockResolvedValue(entry)
    const meta = await mediaMetadata({ params })
    expect(meta.alternates.canonical).toBe(`${ORIGIN}/media/observacion-lunar`)
    expect(meta.openGraph.url).toBe(`${ORIGIN}/media/observacion-lunar`)
    expect(new URL(meta.alternates.canonical).host).toBe(PRODUCTION_HOST)
  })

  it('uses the entry title and description, without the site name', async () => {
    getMediaEntry.mockResolvedValue(entry)
    const meta = await mediaMetadata({ params })
    expect(meta.title).toBe(entry.title)
    expect(meta.title).not.toMatch(/SAC/i)
    expect(meta.description).toBe(entry.description)
  })

  it('promotes the S3 thumbnail to og:image and twitter:image', async () => {
    getMediaEntry.mockResolvedValue(entry)
    const meta = await mediaMetadata({ params })
    expect(firstImageUrl(meta.openGraph.images)).toBe(entry.thumbnail)
    expect(firstImageUrl(meta.twitter.images)).toBe(entry.thumbnail)
    expect(meta.openGraph.type).toBe('video.other')
  })

  it('falls back to the social banner when the entry has no thumbnail', async () => {
    getMediaEntry.mockResolvedValue({ ...entry, thumbnail: undefined })
    const meta = await mediaMetadata({ params })
    expect(firstImageUrl(meta.openGraph.images)).toBe(`${ORIGIN}${siteMetadata.socialBanner}`)
  })

  it('writes a Spanish fallback description when the entry has none', async () => {
    getMediaEntry.mockResolvedValue({ ...entry, description: '' })
    const meta = await mediaMetadata({ params })
    expect(meta.description).toContain(entry.title)
    expect(meta.description).not.toBe('')
  })

  it('still emits og:site_name and og:locale', async () => {
    getMediaEntry.mockResolvedValue(entry)
    const meta = await mediaMetadata({ params })
    expect(meta.openGraph.siteName).toBe(siteMetadata.title)
    expect(meta.openGraph.locale).toBe('es_PR')
  })

  it('marks an unknown slug noindex instead of shipping an indexable 404 head', async () => {
    getMediaEntry.mockResolvedValue(null)
    const meta = await mediaMetadata({ params: Promise.resolve({ slug: 'no-existe' }) })
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
  })

  it('calls notFound for an unknown slug instead of returning a soft 404', async () => {
    getMediaEntry.mockResolvedValue(null)
    await expect(MediaPage({ params: Promise.resolve({ slug: 'no-existe' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    )
    expect(notFound).toHaveBeenCalled()
  })

  it('renders normally and does not call notFound for a known slug', async () => {
    getMediaEntry.mockResolvedValue(entry)
    const element = await MediaPage({ params })
    expect(element).toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('the card-test-longname fixture is gone', () => {
  it('has no page module left to import', () => {
    expect(() => require.resolve('../../app/card-test-longname/page')).toThrow()
  })
})
