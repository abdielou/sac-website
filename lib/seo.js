import siteMetadata from '@/data/siteMetadata'

/**
 * Canonical origin, always without a trailing slash.
 *
 * The audit of 2026-08 found a single trailing slash in `siteMetadata.siteUrl`
 * had propagated a double slash into og:url, the JSON-LD url, all 77 RSS guid
 * and link values, and the sitemap. Everything that builds an absolute URL must
 * go through `absUrl` so that cannot happen again.
 */
export const ORIGIN = String(siteMetadata.siteUrl).replace(/\/+$/, '')

/**
 * Build an absolute URL from a site-relative path.
 * Accepts '/blog/x', 'blog/x' and already-absolute URLs (returned unchanged).
 */
export function absUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path
  const clean = String(path).replace(/^\/+/, '')
  return clean ? `${ORIGIN}/${clean}` : ORIGIN
}

/** Absolute URL for an article slug ('2026/08/23/foo' or '/blog/2026/08/23/foo'). */
export function articleUrl(slug) {
  const clean = String(slug).replace(/^\/+/, '').replace(/^blog\//, '')
  return absUrl(`blog/${clean}`)
}

/**
 * Map article `images` (a string, an array, or absent) to absolute URLs.
 * Structured data and OpenGraph both require absolute URLs; `metadataBase`
 * covers the metadata export but not hand-serialized JSON-LD.
 */
export function absoluteImages(images) {
  const list = Array.isArray(images) ? images : images ? [images] : []
  const resolved = list.filter(Boolean).map((img) => absUrl(img))
  return resolved.length > 0 ? resolved : [absUrl(siteMetadata.socialBanner)]
}

/**
 * Normalize a date to a full ISO 8601 string.
 * The S3 migration left 62 of 77 articles with a bare 'YYYY-MM-DD' lastmod while
 * `date` carries a time, which made dateModified appear to precede datePublished.
 */
export function toIso(value, fallback) {
  const d = new Date(value ?? fallback ?? Date.now())
  return Number.isNaN(d.getTime()) ? new Date(fallback ?? Date.now()).toISOString() : d.toISOString()
}

/**
 * dateModified must never precede datePublished. Returns the later of the two.
 */
export function safeModified(published, modified) {
  const p = toIso(published)
  const m = toIso(modified, published)
  return new Date(m) < new Date(p) ? p : m
}

/** Shared OpenGraph fields. Spread these; never replace the object wholesale. */
export const baseOpenGraph = {
  siteName: siteMetadata.title,
  locale: 'es_PR',
  type: 'website',
  images: [
    {
      url: absUrl(siteMetadata.socialBanner),
      alt: siteMetadata.title,
    },
  ],
}

/** Shared Twitter card fields. Spread these; never replace the object wholesale. */
export const baseTwitter = {
  card: 'summary_large_image',
  site: '@soc_astrocaribe',
  images: [absUrl(siteMetadata.socialBanner)],
}

/**
 * Build a page's metadata export with a self-referencing canonical and complete
 * OpenGraph and Twitter blocks.
 *
 * Next assigns rather than merges nested metadata objects, so a route that
 * declares a partial `openGraph` silently drops siteName, locale and images.
 * Always route through this helper.
 *
 * @param {object} opts
 * @param {string} opts.title      Page title, without the site-name suffix (the
 *                                 root layout's template appends it).
 * @param {string} opts.description
 * @param {string} opts.path       Site-relative canonical path, e.g. '/blog'.
 * @param {object} [opts.openGraph] Extra OpenGraph fields, merged over the base.
 * @param {object} [opts.twitter]   Extra Twitter fields, merged over the base.
 * @param {object} [opts.robots]    Robots directives, e.g. { index: false }.
 */
export function pageMetadata({
  title,
  description,
  path = '/',
  openGraph = {},
  twitter = {},
  robots,
} = {}) {
  const url = absUrl(path)
  const desc = description ?? siteMetadata.description

  const meta = {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      ...baseOpenGraph,
      title: title ?? siteMetadata.title,
      description: desc,
      url,
      ...openGraph,
    },
    twitter: {
      ...baseTwitter,
      title: title ?? siteMetadata.title,
      description: desc,
      ...twitter,
    },
  }

  if (robots) meta.robots = robots
  return meta
}

/** Metadata for a page that must stay out of the index. */
export function noindexMetadata({ title, description, path = '/' } = {}) {
  return pageMetadata({
    title,
    description,
    path,
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  })
}

/** Stable @id for the publisher node, so Article can reference it. */
export const ORGANIZATION_ID = `${ORIGIN}/#organization`

/**
 * Organization (NGO) schema. Emitted once, from the root layout.
 * `sameAs` wires up the four social profiles already configured in
 * data/siteMetadata.js, which were previously unused.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    '@id': ORGANIZATION_ID,
    name: siteMetadata.title,
    alternateName: 'SAC',
    url: ORIGIN,
    logo: {
      '@type': 'ImageObject',
      url: absUrl(siteMetadata.siteLogoLight),
    },
    image: absUrl(siteMetadata.socialBanner),
    description: siteMetadata.description,
    email: siteMetadata.email,
    areaServed: {
      '@type': 'Place',
      name: 'Puerto Rico',
    },
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'PR',
      addressCountry: 'PR',
    },
    sameAs: [
      siteMetadata.twitter,
      siteMetadata.facebook,
      siteMetadata.youtube,
      siteMetadata.instagram,
    ].filter(Boolean),
  }
}

/**
 * BreadcrumbList schema.
 * @param {Array<{name: string, path: string}>} items Ordered, root first.
 */
export function breadcrumbSchema(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absUrl(item.path),
    })),
  }
}

/**
 * Characters that are valid in JSON but unsafe inside an inline script block:
 * a literal < could close the tag early, and U+2028/U+2029 are legal in JSON
 * strings but are line terminators in JavaScript source.
 *
 * The replacement values are built from a backslash constant rather than written
 * as escaped literals, so no build or tooling layer can silently collapse them.
 */
const BACKSLASH = String.fromCharCode(92)
const JSON_LD_UNSAFE = /[<\u2028\u2029]/g
const JSON_LD_ESCAPES = {
  '<': BACKSLASH + 'u003c',
  ['\u2028']: BACKSLASH + 'u2028',
  ['\u2029']: BACKSLASH + 'u2029',
}

/** Serialize JSON-LD for dangerouslySetInnerHTML. */
export function jsonLdScript(data) {
  return JSON.stringify(data).replace(JSON_LD_UNSAFE, (c) => JSON_LD_ESCAPES[c])
}
