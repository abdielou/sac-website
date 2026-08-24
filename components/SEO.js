import Head from 'next/head'
import { useRouter } from 'next/router'
import siteMetadata from '@/data/siteMetadata'
import { absUrl, baseTwitter } from '@/lib/seo'

/**
 * Head tags for the legacy Pages Router.
 *
 * App Router routes build their tags from `pageMetadata` in lib/seo.js, which
 * the Pages Router cannot use. `pages/gallery.js` is the only page left on this
 * side, so this file only has to cover that one case. `BlogSEO`, `TagSEO` and
 * the duplicate Article schema were removed together with the dead layouts that
 * were their only callers.
 *
 * Every URL goes through `absUrl` so the trailing-slash double-slash bug the
 * 2026-08 audit found cannot come back through this path.
 */
export const PageSEO = ({ title, description, noindex = false }) => {
  const router = useRouter()
  // Drop the query and the hash: the canonical must be one stable URL.
  const path = String(router?.asPath ?? '/')
    .split('#')[0]
    .split('?')[0]
  const url = absUrl(path)
  const image = absUrl(siteMetadata.socialBanner)
  // Mirrors the `%s | SAC` title template that app/layout.js applies, so both
  // routers render the same title shape. Callers pass the bare page title.
  const fullTitle = title ? `${title} | ${siteMetadata.headerTitleAbbrev}` : siteMetadata.title
  const desc = description ?? siteMetadata.description

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {/*
        The Pages Router inherits nothing from app/layout.js, so this must repeat
        the same directives the App Router pages get. Without the max-* values
        this would be the one page on the site declaring a weaker policy.

        `noindex` must stay crawlable (noindex, follow, and NOT disallowed in
        robots.txt): Google has to fetch the page to see the directive at all.
        Blocking it in robots.txt instead would leave an already-indexed URL
        indexed forever.
      */}
      <meta
        name="robots"
        content={
          noindex
            ? 'noindex, follow'
            : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        }
      />
      {!noindex && <link rel="canonical" href={url} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={siteMetadata.title} />
      <meta property="og:locale" content="es_PR" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={image} />
      <meta name="twitter:card" content={baseTwitter.card} />
      <meta name="twitter:site" content={baseTwitter.site} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />
    </Head>
  )
}
