// test/admin/search-visible-columns.test.js
// Tests for searching across visible columns

import { COLUMN_REGISTRY } from '@/lib/admin/columnRegistry'

describe('Search across visible columns', () => {
  const mockMembers = [
    {
      id: 1,
      email: 'john@example.com',
      sacEmail: 'john.sac@example.com',
      firstName: 'John',
      initial: 'M',
      lastName: 'Doe',
      slastName: 'Smith',
      phone: '787-555-0001',
      town: 'San Juan',
      profession: 'Engineer',
      status: 'active',
    },
    {
      id: 2,
      email: 'jane@example.com',
      sacEmail: 'jane.sac@example.com',
      firstName: 'Jane',
      initial: 'A',
      lastName: 'Johnson',
      slastName: null,
      phone: '787-555-0002',
      town: 'Ponce',
      profession: 'Teacher',
      status: 'active',
    },
    {
      id: 3,
      email: 'bob@example.com',
      sacEmail: null,
      firstName: 'Bob',
      initial: 'R',
      lastName: 'Williams',
      slastName: null,
      phone: '787-555-0003',
      town: 'Mayagüez',
      profession: 'Doctor',
      status: 'expired',
    },
  ]

  describe('Search logic', () => {
    it('should find member by email when email column is visible', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'email')
      const searchTerm = 'john'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      expect(results).toHaveLength(1)
      expect(results[0].email).toBe('john@example.com')
    })

    it('should find member by phone when phone column is visible', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'phone')
      const searchTerm = '0002'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('Jane')
    })

    it('should find member by town when town column is visible', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'town')
      const searchTerm = 'ponce'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('Jane')
    })

    it('should find member by profession when profession column is visible', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'profession')
      const searchTerm = 'engineer'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('John')
    })

    it('should search across multiple visible columns', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        ['email', 'firstName', 'town', 'profession'].includes(col.id)
      )
      const searchTerm = 'jane'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      // Should find Jane by both email and firstName
      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('Jane')
    })

    it('should not find member when searching field that is not visible', () => {
      // Only email column visible
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'email')
      // Search for town (not visible)
      const searchTerm = 'ponce'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      // Should not find Jane because town column is not visible
      expect(results).toHaveLength(0)
    })

    it('should handle null values gracefully', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'sacEmail')
      const searchTerm = 'sac'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      // Should find John and Jane, but not Bob (sacEmail is null)
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.firstName)).toEqual(['John', 'Jane'])
    })

    it('should be case-insensitive', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'town')
      const searchTerm = 'PONCE'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm.toLowerCase())
        })
      })

      expect(results).toHaveLength(1)
      expect(results[0].town).toBe('Ponce')
    })

    it('should find partial matches', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'profession')
      const searchTerm = 'teach'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      expect(results).toHaveLength(1)
      expect(results[0].profession).toBe('Teacher')
    })

    it('should return empty array when no matches found', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) => col.id === 'email')
      const searchTerm = 'nonexistent'

      const results = mockMembers.filter((member) => {
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          const displayValue = col.formatter ? col.formatter(value) : value
          return String(displayValue).toLowerCase().includes(searchTerm)
        })
      })

      expect(results).toHaveLength(0)
    })
  })
})
