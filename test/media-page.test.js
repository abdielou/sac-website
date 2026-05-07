import React from 'react'

global.React = React

jest.mock('@/lib/media-s3', () => ({
  getMediaEntry: jest.fn(),
}))

jest.mock('@/components/LayoutWrapper', () => function MockLayoutWrapper(props) {
  const React = require('react')
  return React.createElement('main', props)
})

jest.mock('@/components/MediaPlayer', () => function MockMediaPlayer(props) {
  const React = require('react')
  return React.createElement('video', props)
})

const LayoutWrapper = require('@/components/LayoutWrapper')
const MediaPage = require('../app/media/[slug]/page').default
const { getMediaEntry } = require('@/lib/media-s3')

describe('media permalink page', () => {
  test('renders within the public page layout', async () => {
    getMediaEntry.mockResolvedValue({
      slug: 'observacion-lunar',
      title: 'Observacion lunar',
      description: 'Video de una observacion lunar.',
      publishedAt: '2026-05-07T12:00:00.000Z',
    })

    const page = await MediaPage({ params: { slug: 'observacion-lunar' } })

    expect(page.type).toBe(LayoutWrapper)
  })
})
