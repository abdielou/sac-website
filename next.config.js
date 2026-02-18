const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://giscus.app https://platform.twitter.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "frame-src https://giscus.app https://www.youtube.com https://platform.twitter.com https://www.facebook.com",
      "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com",
    ].join('; '),
  },
]

module.exports = withBundleAnalyzer({
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'md', 'mdx'],
  eslint: {
    dirs: ['pages', 'components', 'lib', 'layouts', 'scripts', 'app'],
  },
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
  images: {
    minimumCacheTTL: 21600,
    remotePatterns: [
      { protocol: 'https', hostname: 'tropic.ssec.wisc.edu' },
      { protocol: 'https', hostname: 'cdn.star.nesdis.noaa.gov' },
      { protocol: 'https', hostname: 'sirocco.accuweather.com' },
      { protocol: 'https', hostname: 'www.nhc.noaa.gov' },
      { protocol: 'https', hostname: 'services.swpc.noaa.gov' },
      { protocol: 'https', hostname: 'sdo.gsfc.nasa.gov' },
      { protocol: 'https', hostname: 'www.moonmodule.com' },
      { protocol: 'https', hostname: 'apod.nasa.gov' },
      { protocol: 'https', hostname: 'sac-blog-images.s3.amazonaws.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
})
