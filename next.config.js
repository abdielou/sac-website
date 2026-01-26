const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'md', 'mdx'],
  eslint: {
    dirs: ['pages', 'components', 'lib', 'layouts', 'scripts'],
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
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
})
