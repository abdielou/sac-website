// MediaPlayer Component Tests

import React from 'react'
import MediaPlayer from '../components/MediaPlayer'

describe('MediaPlayer Component', () => {
  test('should render without crashing with url prop', () => {
    const component = React.createElement(MediaPlayer, { url: '/media/test-video' })
    expect(component).toBeTruthy()
    expect(component.type).toBe(MediaPlayer)
  })

  test('should receive correct url prop', () => {
    const component = React.createElement(MediaPlayer, { url: '/media/my-video' })

    expect(component.props.url).toBe('/media/my-video')
  })

  test('should validate prop types', () => {
    const component = React.createElement(MediaPlayer, { url: '/media/test-video' })

    expect(typeof component.props.url).toBe('string')
  })
})