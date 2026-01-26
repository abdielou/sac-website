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
    domains: [
      'tropic.ssec.wisc.edu',
      'cdn.star.nesdis.noaa.gov',
      'sirocco.accuweather.com',
      'www.nhc.noaa.gov',
      'services.swpc.noaa.gov',
      'sdo.gsfc.nasa.gov',
      'www.moonmodule.com',
      'apod.nasa.gov',
      'localhost',
    ],
  },
})
