/**
 * Core Web Vitals regression guards for the article and listing components.
 *
 * @testing-library/react is not installed in this repo, so the components are
 * rendered with `react-dom/server` (which never runs an effect, and therefore
 * shows exactly what the prerendered HTML contains) and, where an interaction
 * matters, with `react-dom/client` plus React's own `act`.
 */
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'

global.IS_REACT_ACT_ENVIRONMENT = true

// jest.config.js compiles JSX with the classic runtime, which expects a `React`
// binding in every module. The app files rely on the automatic runtime that Next
// configures, so the components are given one through the global scope instead of
// changing the shared jest config.
global.React = React

// next/image cannot run outside a Next build, so it is replaced by a plain img
// that echoes the props under test back as data attributes.
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    const { src, alt, width, height, sizes, priority, loading, fetchPriority, className } = props
    return require('react').createElement('img', {
      src: typeof src === 'string' ? src : '',
      alt,
      width,
      height,
      className,
      'data-sizes': sizes === undefined ? 'none' : sizes,
      'data-priority': String(Boolean(priority)),
      'data-loading': loading === undefined ? 'none' : loading,
      'data-fetchpriority': fetchPriority === undefined ? 'none' : fetchPriority,
    })
  },
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }) =>
    require('react').createElement('a', { href, ...rest }, children),
}))

jest.mock('@/components/MobileNav', () => ({
  __esModule: true,
  default: () => require('react').createElement('div', { 'data-testid': 'mobile-nav' }),
}))

jest.mock('@/components/ThemeSwitch', () => ({
  __esModule: true,
  default: () => require('react').createElement('div', { 'data-testid': 'theme-switch' }),
}))

jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => require('react').createElement('footer', null),
}))

jest.mock('@/components/MediaPlayer', () => ({
  __esModule: true,
  default: () => require('react').createElement('div', { 'data-testid': 'media-player' }),
}))

const LayoutWrapper = require('@/components/LayoutWrapper').default
const Image = require('@/components/Image').default
const { resolveSizes, COLUMN_SIZES } = require('@/components/Image')
const ArticleItem = require('@/components/articles/ArticleItem').default
const { THUMBNAIL_SIZES } = require('@/components/articles/ArticleItem')
const ResponsiveReactPlayer = require('@/components/ResponsiveReactPlayer').default
const {
  youTubeEmbedUrl,
  youTubePosterUrl,
  getYouTubeId,
} = require('@/components/ResponsiveReactPlayer')
const siteMetadataModule = require('@/data/siteMetadata')
const siteMetadata = siteMetadataModule.default || siteMetadataModule

describe('LayoutWrapper header logo (CLS)', () => {
  // renderToStaticMarkup runs no effect, so anything it emits is what the
  // prerendered HTML contains. The logo used to be gated behind a `mounted`
  // flag and was therefore missing here, which measured CLS 0.1233.
  const render = (props = {}) =>
    renderToStaticMarkup(React.createElement(LayoutWrapper, props, 'contenido'))

  it('renders the logo in server HTML, with no mount effect', () => {
    const html = render()
    expect(html).toContain('SAC Logo')
    expect(html).toContain(siteMetadata.siteLogoShortLight)
    expect(html).toContain(siteMetadata.siteLogoShortDark)
    expect(html).toContain(siteMetadata.siteLogoLight)
    expect(html).toContain(siteMetadata.siteLogoDark)
  })

  it('reserves the logo box so the header cannot grow on hydration', () => {
    const html = render()
    expect(html).toContain('width="200"')
    expect(html).toContain('height="47"')
    expect(html).toContain('height="70"')
  })

  it('switches theme variants with CSS, not with JS state', () => {
    const html = render()
    expect(html).toContain('block dark:hidden')
    expect(html).toContain('hidden dark:block')
  })

  it('keeps the mobile and desktop breakpoint swap', () => {
    const html = render()
    expect(html).toContain('mr-3 hidden sm:block')
    expect(html).toContain('mr-3 block sm:hidden')
  })

  it('marks a logo as priority', () => {
    expect(render()).toContain('data-priority="true"')
  })

  it('keeps ThemeSwitch and MobileNav on the default header', () => {
    const html = render()
    expect(html).toContain('theme-switch')
    expect(html).toContain('mobile-nav')
  })

  it('preserves forceLightHeader: one centered light logo, no switch, no nav', () => {
    const html = render({ forceLightHeader: true })
    expect(html).toContain(siteMetadata.siteLogoLight)
    expect(html).not.toContain(siteMetadata.siteLogoDark)
    expect(html).not.toContain('theme-switch')
    expect(html).not.toContain('mobile-nav')
    expect(html).toContain('justify-center')
  })
})

describe('Image sizes and priority', () => {
  it('caps an image wider than the content column to the column width', () => {
    expect(resolveSizes({ width: 1920 })).toBe(COLUMN_SIZES)
    expect(COLUMN_SIZES).toContain('100vw')
    expect(COLUMN_SIZES).toContain('768px')
  })

  it('leaves an image narrower than the column on its DPR srcset', () => {
    expect(resolveSizes({ width: 192 })).toBeUndefined()
    expect(resolveSizes({ width: 768 })).toBeUndefined()
  })

  it('lets the caller override sizes', () => {
    expect(resolveSizes({ sizes: '50vw', width: 1920 })).toBe('50vw')
  })

  it('gives a fill image a sizes hint', () => {
    expect(resolveSizes({ fill: true })).toBe(COLUMN_SIZES)
  })

  it('forwards sizes, priority and fetchPriority to next/image', () => {
    const html = renderToStaticMarkup(
      React.createElement(Image, {
        src: '/static/images/x.jpg',
        alt: 'x',
        width: 1920,
        height: 1080,
        sizes: '50vw',
        priority: true,
        fetchPriority: 'high',
      })
    )
    expect(html).toContain('data-sizes="50vw"')
    expect(html).toContain('data-priority="true"')
    expect(html).toContain('data-fetchpriority="high"')
  })

  it('forwards loading when priority is not set', () => {
    const html = renderToStaticMarkup(
      React.createElement(Image, {
        src: '/static/images/x.jpg',
        alt: 'x',
        width: 1920,
        height: 1080,
        loading: 'eager',
      })
    )
    expect(html).toContain('data-loading="eager"')
    expect(html).toContain('data-priority="false"')
  })

  it('never sends both priority and loading to next/image', () => {
    const html = renderToStaticMarkup(
      React.createElement(Image, {
        src: '/static/images/x.jpg',
        alt: 'x',
        width: 1920,
        height: 1080,
        priority: true,
        loading: 'lazy',
      })
    )
    expect(html).toContain('data-priority="true"')
    expect(html).toContain('data-loading="none"')
  })

  it('keeps the raw img fallback for MDX images without dimensions, now lazy', () => {
    const html = renderToStaticMarkup(
      React.createElement(Image, { src: 'https://example.com/a.jpg', alt: 'a' })
    )
    expect(html).toContain('<img')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).not.toContain('data-priority')
  })
})

describe('ArticleItem LCP thumbnail', () => {
  const post = {
    date: '2026-08-23T08:00:00Z',
    slug: '2026/08/23/prueba',
    title: 'Prueba',
    tags: ['luna'],
    summary: 'Resumen',
    images: ['static/images/blog/a.jpg'],
    imgWidth: 1200,
    imgHeight: 800,
  }

  it('sets priority and fetchPriority on the first item', () => {
    const html = renderToStaticMarkup(React.createElement(ArticleItem, { ...post, isFirst: true }))
    expect(html).toContain('data-priority="true"')
    expect(html).toContain('data-fetchpriority="high"')
  })

  it('defaults to false so existing callers stay lazy', () => {
    const html = renderToStaticMarkup(React.createElement(ArticleItem, post))
    expect(html).toContain('data-priority="false"')
    expect(html).toContain('data-fetchpriority="none"')
  })

  it('passes a thumbnail-column sizes hint', () => {
    const html = renderToStaticMarkup(React.createElement(ArticleItem, post))
    expect(html).toContain('data-sizes="' + THUMBNAIL_SIZES + '"')
    expect(THUMBNAIL_SIZES).toContain('100vw')
  })
})

describe('ResponsiveReactPlayer embeds', () => {
  it('ships a click-to-load facade instead of an eager YouTube iframe', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResponsiveReactPlayer, {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      })
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain(youTubePosterUrl('dQw4w9WgXcQ'))
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).toContain('Reproducir el video de YouTube')
  })

  it('uses youtube-nocookie for the real player', () => {
    expect(youTubeEmbedUrl('dQw4w9WgXcQ')).toContain('youtube-nocookie.com')
  })

  it('mounts a lazy YouTube iframe on click', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        React.createElement(ResponsiveReactPlayer, { url: 'https://youtu.be/dQw4w9WgXcQ' })
      )
    })
    expect(container.querySelector('iframe')).toBeNull()

    act(() => {
      container.querySelector('button').click()
    })

    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('loading')).toBe('lazy')
    expect(iframe.getAttribute('src')).toContain('youtube-nocookie.com')

    act(() => root.unmount())
    container.remove()
  })

  it('renders a Shorts URL as a portrait facade', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResponsiveReactPlayer, {
        url: 'https://www.youtube.com/shorts/GamSEEuckiU',
      })
    )
    expect(html).toContain(youTubePosterUrl('GamSEEuckiU'))
    expect(html).toContain('pb-[177.78%]')
    expect(html).not.toContain('<a')
  })

  // A percentage padding-bottom resolves against the parent width. The width cap
  // must therefore sit on a wrapper, or the box takes the full column height.
  it('keeps the Shorts width cap off the padding box', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResponsiveReactPlayer, {
        url: 'https://www.youtube.com/shorts/GamSEEuckiU',
      })
    )
    expect(html).toMatch(/max-w-\[\d+px\] mx-auto"><span class="block relative pb-\[177\.78%\]/)
  })

  // Markdown wraps a lone component in a <p>. A <div> there is invalid HTML and
  // makes React log a hydration error, so every container must be a <span>.
  it('emits no div, so it stays valid inside a markdown paragraph', () => {
    const urls = [
      'https://www.youtube.com/shorts/GamSEEuckiU',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.facebook.com/sac/videos/123456789',
    ]
    urls.forEach((url) => {
      const html = renderToStaticMarkup(React.createElement(ResponsiveReactPlayer, { url }))
      expect(html).not.toContain('<div')
    })
  })

  it('recognizes a /live/ URL', () => {
    expect(getYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('lazy-loads the Facebook iframe', () => {
    const html = renderToStaticMarkup(
      React.createElement(ResponsiveReactPlayer, {
        url: 'https://www.facebook.com/sac/videos/123456789',
      })
    )
    expect(html).toContain('<iframe')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('facebook.com/plugins/video.php')
  })

  it('keeps the internal media and plain link fallbacks', () => {
    expect(
      renderToStaticMarkup(
        React.createElement(ResponsiveReactPlayer, { url: 'https://sac.test/media/a.mp4' })
      )
    ).toContain('media-player')
    expect(
      renderToStaticMarkup(
        React.createElement(ResponsiveReactPlayer, { url: 'https://sac.test/a' })
      )
    ).toContain('<a')
  })
})
