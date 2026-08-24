const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
const siteMetadata = require('./data/siteMetadata')

// This file is CommonJS and lib/seo.js is ESM, so the origin is normalized here
// too. Keep the rule identical: no trailing slash, ever.
const ORIGIN = String(siteMetadata.siteUrl).replace(/\/+$/, '')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://giscus.app https://platform.twitter.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      // youtube-nocookie is the host the click-to-load facade in
      // components/ResponsiveReactPlayer.js mounts; without it the iframe is
      // refused and the reader gets a blank box.
      'frame-src https://giscus.app https://www.youtube.com https://www.youtube-nocookie.com https://platform.twitter.com https://www.facebook.com',
      "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com",
    ].join('; '),
  },
]

module.exports = withBundleAnalyzer({
  serverExternalPackages: ['@react-pdf/renderer'],
  turbopack: {},
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'md', 'mdx'],
  webpack: (config, { dev, isServer }) => {
    config.module.rules.push({
      test: /\.(png|jpe?g|gif|mp4)$/i,
      use: [
        {
          loader: 'file-loader',
          options: {
            publicPath: '/_next',
            name: 'static/media/[name].[hash].[ext]',
          },
        },
      ],
    })

    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })

    return config
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  async redirects() {
    return [
      // The Vercel preview host serves a full copy of the site. Without this the
      // two hosts compete for the same content in the index. 308 keeps the
      // method and tells crawlers the move is permanent.
      {
        source: '/:path*',
        has: [{ type: 'host', value: siteMetadata.previewHost }],
        destination: `${ORIGIN}/:path*`,
        permanent: true,
      },
      // /blog/page/1 renders byte-identical output to /blog.
      {
        source: '/blog/page/1',
        destination: '/blog',
        permanent: true,
      },
    ]
  },
  images: {
    minimumCacheTTL: 2678400,
    // Without this Next negotiates WebP only and never serves AVIF.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'tropic.ssec.wisc.edu' },
      { protocol: 'https', hostname: 'cdn.star.nesdis.noaa.gov' },
      { protocol: 'https', hostname: 'sirocco.accuweather.com' },
      { protocol: 'https', hostname: 'www.nhc.noaa.gov' },
      { protocol: 'https', hostname: 'services.swpc.noaa.gov' },
      { protocol: 'https', hostname: 'sdo.gsfc.nasa.gov' },
      { protocol: 'https', hostname: 'soho.nascom.nasa.gov' },
      { protocol: 'https', hostname: 'www.moonmodule.com' },
      { protocol: 'https', hostname: 'apod.nasa.gov' },
      { protocol: 'https', hostname: 'sac-blog-images.s3.amazonaws.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
})
