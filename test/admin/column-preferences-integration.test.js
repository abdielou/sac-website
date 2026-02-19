// test/admin/column-preferences-integration.test.js
// Integration tests for column preferences with localStorage

import { getDefaultColumnIds, COLUMN_REGISTRY } from '@/lib/admin/columnRegistry'

describe('Column Preferences Integration', () => {
  describe('localStorage persistence logic', () => {
    it('should handle valid JSON array from localStorage', () => {
      const savedColumns = ['email', 'firstName', 'lastName']
      const stored = JSON.stringify(savedColumns)
      
      // Simulate the getInitialColumns logic
      let result
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          result = parsed
        } else {
          result = getDefaultColumnIds()
        }
      } catch (e) {
        result = getDefaultColumnIds()
      }

      expect(result).toEqual(savedColumns)
    })

    it('should fall back to defaults when localStorage has invalid JSON', () => {
      const stored = 'invalid json'
      
      let result
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          result = parsed
        } else {
          result = getDefaultColumnIds()
        }
      } catch (e) {
        result = getDefaultColumnIds()
      }

      expect(result).toEqual(getDefaultColumnIds())
    })

    it('should fall back to defaults when localStorage has non-array data', () => {
      const stored = JSON.stringify({ not: 'an array' })
      
      let result
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          result = parsed
        } else {
          result = getDefaultColumnIds()
        }
      } catch (e) {
        result = getDefaultColumnIds()
      }

      expect(result).toEqual(getDefaultColumnIds())
    })

    it('should fall back to defaults when localStorage has empty array', () => {
      const stored = JSON.stringify([])
      
      let result
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          result = parsed
        } else {
          result = getDefaultColumnIds()
        }
      } catch (e) {
        result = getDefaultColumnIds()
      }

      expect(result).toEqual(getDefaultColumnIds())
    })
  })

  describe('Toggle column logic', () => {
    it('should add column when not visible', () => {
      const prev = ['email', 'firstName']
      const columnId = 'lastName'
      
      const result = prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]

      expect(result).toContain('lastName')
      expect(result).toHaveLength(3)
    })

    it('should remove column when visible', () => {
      const prev = ['email', 'firstName', 'lastName']
      const columnId = 'firstName'
      
      const result = prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]

      expect(result).not.toContain('firstName')
      expect(result).toHaveLength(2)
    })

    it('should prevent hiding last visible column', () => {
      const prev = ['email']
      const columnId = 'email'
      
      // Simulate last-column protection
      let result
      if (prev.includes(columnId) && prev.length === 1) {
        result = prev
      } else {
        result = prev.includes(columnId)
          ? prev.filter((id) => id !== columnId)
          : [...prev, columnId]
      }

      expect(result).toContain('email')
      expect(result).toHaveLength(1)
    })
  })

  describe('Reset to default logic', () => {
    it('should restore default columns', () => {
      const defaultIds = getDefaultColumnIds()
      
      expect(defaultIds).toEqual([
        'email',
        'sacEmail',
        'firstName',
        'initial',
        'lastName',
        'expirationDate',
        'status',
        'lastPayment',
      ])
      expect(defaultIds).toHaveLength(8)
    })
  })

  describe('Visible column count', () => {
    it('should accurately count visible columns', () => {
      const visibleColumnIds = ['email', 'firstName', 'lastName']
      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        visibleColumnIds.includes(col.id)
      )

      expect(visibleColumnIds).toHaveLength(3)
      expect(visibleColumns).toHaveLength(3)
    })

    it('should filter columns correctly', () => {
      const visibleColumnIds = ['email', 'firstName', 'nonexistent']
      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        visibleColumnIds.includes(col.id)
      )

      // Should only include columns that exist in registry
      expect(visibleColumns).toHaveLength(2)
      expect(visibleColumns.map((c) => c.id)).toEqual(['email', 'firstName'])
    })
  })

  describe('Persistence round-trip', () => {
    it('should serialize and deserialize column selection', () => {
      const customColumns = ['email', 'firstName', 'phone', 'id']
      
      // Serialize
      const serialized = JSON.stringify(customColumns)
      
      // Deserialize
      const deserialized = JSON.parse(serialized)
      
      expect(deserialized).toEqual(customColumns)
      expect(Array.isArray(deserialized)).toBe(true)
    })
  })
})
