// ObjectCard image choice: own image, SkyView fallback, or a placeholder

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The app sources rely on the automatic JSX runtime; babel-jest here uses the
// classic one, so the transformed modules need React in scope.
global.React = React

jest.mock('@/data/catalog/hubble-images.json', () => ({ NGC0224: 'heic0512a' }))

const { default: ObjectCard, getLargeImageUrl } = require('../../app/guides/ObjectCard')

const render = (entry) => renderToStaticMarkup(React.createElement(ObjectCard, { entry }))

const manualCatalog = (extra = {}) => ({
  id: null,
  name: '',
  commonNameEs: 'Júpiter',
  objectType: 'Planeta',
  constellation: null,
  magnitude: -2.5,
  ra: null,
  dec: null,
  ...extra,
})

describe('ObjectCard thumbnail', () => {
  test('uses the entry image when there is one', () => {
    const html = render({
      objectId: 'manual-a1',
      imageUrl: 'https://example.com/jupiter.jpg',
      catalog: manualCatalog(),
    })
    expect(html).toContain('src="https://example.com/jupiter.jpg"')
    expect(html).toContain('Júpiter')
  })

  test('falls back to SkyView when there are coordinates', () => {
    const html = render({
      objectId: 'manual-a1',
      imageUrl: null,
      catalog: manualCatalog({ ra: 150.2, dec: 12.3 }),
    })
    expect(html).toContain('skyview.gsfc.nasa.gov')
    expect(html).toContain('Position=150.2,12.3')
  })

  test('shows a placeholder when there is no image and no coordinates', () => {
    const html = render({ objectId: 'manual-a1', imageUrl: null, catalog: manualCatalog() })
    expect(html).not.toContain('<img')
    expect(html).toContain('aria-label="Sin imagen de Júpiter"')
  })

  test('shows the designation line for a manual object that has one', () => {
    const html = render({
      objectId: 'manual-a1',
      imageUrl: null,
      catalog: manualCatalog({ name: 'C/2025 A1', commonNameEs: 'Cometa C/2025 A1' }),
    })
    expect(html).toContain('C/2025 A1</p>')
    expect(html).not.toContain('manual-a1')
  })
})

describe('getLargeImageUrl', () => {
  test('prefers the Hubble image', () => {
    expect(
      getLargeImageUrl({ objectId: 'NGC0224', imageUrl: 'https://x/thumb.jpg' }, { ra: 1, dec: 2 })
    ).toBe('https://cdn.esahubble.org/archives/images/screen/heic0512a.jpg')
  })

  test('uses the entry image next', () => {
    expect(
      getLargeImageUrl({ objectId: 'manual-a1', imageUrl: 'https://x/a.jpg' }, { ra: 1, dec: 2 })
    ).toBe('https://x/a.jpg')
  })

  test('then SkyView, then nothing', () => {
    expect(getLargeImageUrl({ objectId: 'manual-a1', imageUrl: null }, { ra: 1, dec: 2 })).toMatch(
      /skyview.*Pixels=600/
    )
    expect(
      getLargeImageUrl({ objectId: 'manual-a1', imageUrl: null }, { ra: null, dec: null })
    ).toBe(null)
  })
})
