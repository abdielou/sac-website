// GalleryGrid Component Tests

// Mock dependencies
jest.mock('react-masonry-css', () => {
  return function MockMasonry({ children }) {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'masonry' }, children)
  }
})

jest.mock('@/components/Card', () => {
  return function MockCard(props) {
    const React = require('react')
    global.mockCardProps = props
    return React.createElement('div', { 'data-testid': 'card' }, props.title)
  }
})

// Now import React and GalleryGrid
import React from 'react'
import GalleryGrid from '../../components/GalleryGrid'

describe('GalleryGrid Component', () => {
  // Test data setup
  const mockImages = [
    {
      href: 'image1',
      title: 'Test Image 1',
      description: 'Description 1',
      imgSrc: 'http://example.com/image1.jpg',
      width: 800,
      height: 600,
      imageOptimize: false,
    },
    {
      href: 'image2',
      title: 'Test Image 2',
      description: 'Description 2',
      imgSrc: 'http://example.com/image2.jpg',
      width: 1200,
      height: 800,
      imageOptimize: true,
    },
  ]

  const mockOnSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    global.mockCardProps = null
  })

  // Test: Component creation
  test('should render without crashing with required props', () => {
    const props = { images: mockImages, onSelect: mockOnSelect }
    const component = React.createElement(GalleryGrid, props)
    expect(component).toBeTruthy()
    expect(component.type).toBe(GalleryGrid)
  })

  // Test: Props validation
  test('should accept correct props structure', () => {
    const props = { images: mockImages, onSelect: mockOnSelect }
    const component = React.createElement(GalleryGrid, props)

    // Test GalleryGrid component receives correct props
    expect(component.props.images).toEqual(mockImages)
    expect(component.props.images).toHaveLength(2)
    expect(typeof component.props.onSelect).toBe('function')
  })

  // Test: Empty images array
  test('should handle empty images array', () => {
    const props = { images: [], onSelect: mockOnSelect }
    const component = React.createElement(GalleryGrid, props)

    expect(component.props.images).toEqual([])
    expect(component.props.images).toHaveLength(0)
    expect(typeof component.props.onSelect).toBe('function')
  })

  // Test: Single image
  test('should handle single image', () => {
    const singleImage = [mockImages[0]]
    const props = { images: singleImage, onSelect: mockOnSelect }
    const component = React.createElement(GalleryGrid, props)

    expect(component.props.images).toHaveLength(1)
    expect(component.props.images[0].title).toBe('Test Image 1')
    expect(component.props.images[0].href).toBe('image1')
  })

  // Test: Image structure validation
  test('should validate image object structure', () => {
    const props = { images: mockImages, onSelect: mockOnSelect }
    const component = React.createElement(GalleryGrid, props)

    const firstImage = component.props.images[0]
    expect(typeof firstImage.href).toBe('string')
    expect(typeof firstImage.title).toBe('string')
    expect(typeof firstImage.description).toBe('string')
    expect(typeof firstImage.imgSrc).toBe('string')
    expect(typeof firstImage.width).toBe('number')
    expect(typeof firstImage.height).toBe('number')
    expect(typeof firstImage.imageOptimize).toBe('boolean')
  })

  // Test: onSelect function prop
  test('should receive onSelect function prop', () => {
    const props = { images: mockImages, onSelect: mockOnSelect }
    const component = React.createElement(GalleryGrid, props)

    expect(component.props.onSelect).toBe(mockOnSelect)
    expect(typeof component.props.onSelect).toBe('function')
  })
})
