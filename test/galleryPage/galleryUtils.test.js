// GalleryUtils Functions Tests

// Import the utility functions
import { getAvailableYears, getMonthNames } from '../../lib/utils/galleryUtils'

describe('GalleryUtils Functions', () => {
  // Test: getAvailableYears function
  describe('getAvailableYears function', () => {
    // Test: Basic functionality
    test('should return available years from metadata', () => {
      const metadata = [{ year: 2021 }, { year: 2022 }, { year: 2023 }]
      const currentYear = 2023

      const result = getAvailableYears(metadata, currentYear)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain(2021)
      expect(result).toContain(2022)
      expect(result).toContain(2023)
    })

    // Test: Empty input
    test('should handle empty metadata array', () => {
      const metadata = []
      const currentYear = 2023

      const result = getAvailableYears(metadata, currentYear)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    // Test: String years
    test('should handle metadata with string years', () => {
      const metadata = [{ year: '2021' }, { year: '2022' }]
      const currentYear = 2023

      const result = getAvailableYears(metadata, currentYear)
      expect(result).toContain(2021)
      expect(result).toContain(2022)
      expect(typeof result[0]).toBe('number')
    })

    // Test: Invalid data
    test('should handle metadata with null/invalid years', () => {
      const metadata = [{ year: null }, { year: 'invalid' }, { year: 2022 }]
      const currentYear = 2023

      const result = getAvailableYears(metadata, currentYear)
      expect(result).toContain(2022)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // Test: getMonthNames function
  describe('getMonthNames function', () => {
    // Test: Basic functionality
    test('should return month names array with empty first element', () => {
      const result = getMonthNames('es')

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(13)
      expect(result[0]).toBe('')
    })

    // Test: Spanish locale
    test('should return Spanish month names by default', () => {
      const result = getMonthNames('es')

      expect(result[1]).toBe('enero')
      expect(result[2]).toBe('febrero')
      expect(result[12]).toBe('diciembre')
    })

    // Test: Different locales
    test('should handle different locales', () => {
      const resultEs = getMonthNames('es')
      const resultEn = getMonthNames('en')

      expect(resultEs[1]).toBe('enero')
      expect(resultEn[1]).toBe('January')
      expect(typeof resultEs[1]).toBe('string')
      expect(typeof resultEn[1]).toBe('string')
    })

    // Test: Array structure
    test('should return consistent array length', () => {
      const result = getMonthNames()

      expect(result).toHaveLength(13)
      expect(result[0]).toBe('')
      expect(result[13]).toBeUndefined()
    })
  })
})
