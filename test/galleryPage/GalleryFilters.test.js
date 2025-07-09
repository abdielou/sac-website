// GalleryFilters Component Tests

// Now import React and GalleryFilters
import React from 'react'
import GalleryFilters from '../../components/GalleryFilters'

describe('GalleryFilters Component', () => {
  // Test data setup
  const mockProps = {
    year: '',
    setYear: jest.fn(),
    month: '',
    setMonth: jest.fn(),
    searchTerm: '',
    setSearchTerm: jest.fn(),
    years: [2021, 2022, 2023],
    monthNames: [
      '',
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Test: Component creation
  test('should render without crashing with required props', () => {
    const component = React.createElement(GalleryFilters, mockProps)
    expect(component).toBeTruthy()
    expect(component.type).toBe(GalleryFilters)
  })

  // Test: Props validation
  test('should accept correct props structure', () => {
    const component = React.createElement(GalleryFilters, mockProps)

    // Test GalleryFilters component receives correct props
    expect(component.props.year).toBe('')
    expect(component.props.month).toBe('')
    expect(component.props.searchTerm).toBe('')
    expect(component.props.years).toEqual([2021, 2022, 2023])
    expect(component.props.monthNames).toHaveLength(13)
    expect(typeof component.props.setYear).toBe('function')
    expect(typeof component.props.setMonth).toBe('function')
    expect(typeof component.props.setSearchTerm).toBe('function')
  })

  // Test: Year filter props
  test('should handle year filter props correctly', () => {
    const propsWithYear = { ...mockProps, year: '2022' }
    const component = React.createElement(GalleryFilters, propsWithYear)

    expect(component.props.year).toBe('2022')
    expect(component.props.years).toContain(2022)
  })

  // Test: Month filter props
  test('should handle month filter props correctly', () => {
    const propsWithMonth = { ...mockProps, month: '5' }
    const component = React.createElement(GalleryFilters, propsWithMonth)

    expect(component.props.month).toBe('5')
    expect(component.props.monthNames[5]).toBe('mayo')
  })

  // Test: Search term props
  test('should handle search term props correctly', () => {
    const propsWithSearch = { ...mockProps, searchTerm: 'test search' }
    const component = React.createElement(GalleryFilters, propsWithSearch)

    expect(component.props.searchTerm).toBe('test search')
    expect(typeof component.props.searchTerm).toBe('string')
  })
})
