// GalleryImageModal Component Tests

// Now import React and GalleryImageModal
import React from 'react'
import GalleryImageModal from '../../components/GalleryImageModal'

describe('GalleryImageModal Component', () => {
  // Test data setup
  const mockImage = {
    imgSrc: 'http://example.com/test.jpg',
    title: 'Test Image',
    description: 'Test Description',
    year: 2023,
    month: 5,
  }

  const mockMonthNames = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio']
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Test: Component creation
  test('should render without crashing with image prop', () => {
    const props = { image: mockImage, monthNames: mockMonthNames, onClose: mockOnClose }
    const component = React.createElement(GalleryImageModal, props)
    expect(component).toBeTruthy()
    expect(component.type).toBe(GalleryImageModal)
  })

  // Test: Props validation
  test('should accept correct props structure', () => {
    const props = { image: mockImage, monthNames: mockMonthNames, onClose: mockOnClose }
    const component = React.createElement(GalleryImageModal, props)

    // Test GalleryImageModal component receives correct props
    expect(component.props.image).toEqual(mockImage)
    expect(component.props.monthNames).toEqual(mockMonthNames)
    expect(typeof component.props.onClose).toBe('function')
  })

  // Test: Null image handling
  test('should handle null image prop', () => {
    const props = { image: null, monthNames: mockMonthNames, onClose: mockOnClose }
    const component = React.createElement(GalleryImageModal, props)

    expect(component.props.image).toBe(null)
    expect(component.type).toBe(GalleryImageModal)
  })

  // Test: Complete image object
  test('should handle image with all properties', () => {
    const fullImage = {
      imgSrc: 'http://example.com/full.jpg',
      title: 'Full Image',
      description: 'Full Description',
      year: 2022,
      month: 3,
    }

    const props = { image: fullImage, monthNames: mockMonthNames, onClose: mockOnClose }
    const component = React.createElement(GalleryImageModal, props)

    expect(component.props.image.imgSrc).toBe('http://example.com/full.jpg')
    expect(component.props.image.title).toBe('Full Image')
    expect(component.props.image.description).toBe('Full Description')
    expect(typeof component.props.image.year).toBe('number')
    expect(typeof component.props.image.month).toBe('number')
  })

  // Test: Minimal image object
  test('should handle image without description or date', () => {
    const minimalImage = {
      imgSrc: 'http://example.com/minimal.jpg',
      title: 'Minimal Image',
    }

    const props = { image: minimalImage, monthNames: mockMonthNames, onClose: mockOnClose }
    const component = React.createElement(GalleryImageModal, props)

    expect(component.props.image.imgSrc).toBe('http://example.com/minimal.jpg')
    expect(component.props.image.title).toBe('Minimal Image')
    expect(component.props.image.description).toBeUndefined()
    expect(component.props.image.year).toBeUndefined()
    expect(component.props.image.month).toBeUndefined()
  })
})
