import { absUrl } from '@/lib/seo'

export const revalidate = 3600

/**
 * Private or non-canonical areas.
 *
 * /_next/ is deliberately NOT disallowed: blocking it stops Googlebot from
 * fetching the CSS and JS it needs to render the page, which breaks the
 * mobile-friendly and Core Web Vitals assessments.
 *
 * The obsolete `host:` directive is likewise omitted. Google dropped support in
 * 2016 and the canonical host is asserted by the 308 redirect in next.config.js.
 */
/**
 * Only the API is disallowed. Private pages stay crawlable on purpose.
 *
 * Google does not crawl a disallowed URL, so it cannot see the URL's noindex
 * tag or its redirect. A URL indexed before the block then stays in the index.
 * That kept /admin and /auth/signin in search results.
 *
 * - /admin and /member redirect anonymous visitors to sign-in (proxy.js).
 * - /auth/* and /verify/* serve noindex (noindexMetadata in lib/seo.js).
 *
 * robots.txt matches by prefix, so a bare `/member` rule would also block
 * the public `/membership` page. Anchor any future page rule with `$`.
 */
const DISALLOW = ['/api/']

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: absUrl('/sitemap.xml'),
  }
}
