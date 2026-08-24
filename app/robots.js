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
 * robots.txt paths match by prefix with no implicit word boundary, so a bare
 * `/member` would also block `/membership` — a public conversion page that is
 * in the nav and in the sitemap. Each private area is therefore listed twice:
 * `$` to anchor the bare path, and a trailing slash for its subtree.
 */
const DISALLOW = [
  '/admin$',
  '/admin/',
  '/member$',
  '/member/',
  '/api/',
  '/auth/',
  '/verify/',
  '/card-test-longname',
]

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
