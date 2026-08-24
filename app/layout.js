import '@/css/tailwind.css'
import '@/css/prism.css'

import { Providers } from './providers'
import siteMetadata from '@/data/siteMetadata'
import { ORIGIN, baseOpenGraph, baseTwitter, jsonLdScript, organizationSchema } from '@/lib/seo'

export const metadata = {
  // siteUrl has no trailing slash, so relative canonicals resolve without a double slash.
  metadataBase: new URL(siteMetadata.siteUrl),
  title: {
    default: siteMetadata.title,
    template: `%s | ${siteMetadata.headerTitleAbbrev}`,
  },
  description: siteMetadata.description,
  // Search Console ownership. Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the
  // token from the "HTML tag" verification method. This is the route to take
  // when you cannot add the DNS TXT record a domain property needs: it verifies
  // a URL-prefix property instead, and the tag is served on every page.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
  // No `alternates.canonical` here on purpose. Root metadata is inherited by
  // every descendant segment that does not declare its own, so a canonical set
  // here would make every such route claim the home page as its canonical.
  // app/page.js emits the home canonical itself via pageMetadata({ path: '/' }).
  openGraph: {
    ...baseOpenGraph,
    title: siteMetadata.title,
    description: siteMetadata.description,
    url: ORIGIN,
  },
  twitter: {
    ...baseTwitter,
    title: siteMetadata.title,
    description: siteMetadata.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="76x76" href="/static/favicons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/favicons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/favicons/favicon-16x16.png" />
        <link rel="manifest" href="/static/favicons/site.webmanifest" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="theme-color" content="#000000" />
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Open+Sans:wght@300;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased text-black bg-white dark:bg-gray-900 dark:text-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationSchema()) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
