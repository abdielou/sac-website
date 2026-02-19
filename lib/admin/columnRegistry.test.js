// lib/admin/columnRegistry.test.js
// Unit tests for column registry and configuration system

import { COLUMN_REGISTRY, getDefaultColumnIds, getColumnById } from './columnRegistry'

describe('Column Registry', () => {
  it('should contain all required default columns', () => {
    const defaultColumns = COLUMN_REGISTRY.filter((col) => col.defaultVisible)
    const defaultIds = defaultColumns.map((col) => col.id)

    // Verify all 8 current default columns are present
    expect(defaultIds).toContain('email')
    expect(defaultIds).toContain('sacEmail')
    expect(defaultIds).toContain('firstName')
    expect(defaultIds).toContain('initial')
    expect(defaultIds).toContain('lastName')
    expect(defaultIds).toContain('expirationDate')
    expect(defaultIds).toContain('status')
    expect(defaultIds).toContain('lastPayment')
    expect(defaultIds).toHaveLength(8)
  })

  it('should contain all additional columns', () => {
    const allIds = COLUMN_REGISTRY.map((col) => col.id)

    // Verify additional columns are present (beyond the 8 defaults)
    expect(allIds).toContain('phone')
    expect(allIds).toContain('id')
    expect(allIds).toContain('name')
    expect(allIds).toContain('monthsSincePayment')
    expect(allIds).toContain('lastPaymentAmount')
    expect(allIds).toContain('lastPaymentNotes')
    expect(allIds).toContain('lastPaymentSource')
    
    // Verify spreadsheet columns are present
    expect(allIds).toContain('timestamp')
    expect(allIds).toContain('formPurpose')
    expect(allIds).toContain('postalAddress')
    expect(allIds).toContain('town')
    expect(allIds).toContain('zipcode')
    expect(allIds).toContain('memberSince')
    expect(allIds).toContain('birthDate')
    expect(allIds).toContain('profession')
    expect(allIds).toContain('areasOfInterest')
    expect(allIds).toContain('familyGroup')
    expect(allIds).toContain('hasTelescope')
    expect(allIds).toContain('telescopeModel')
    expect(allIds).toContain('otherEquipment')
    expect(allIds).toContain('howDidYouHear')
    expect(allIds).toContain('wantsToCollaborate')
    expect(allIds).toContain('createdAt')
    expect(allIds).toContain('dataStatus')
  })

  it('should have all required properties for each column', () => {
    COLUMN_REGISTRY.forEach((col) => {
      expect(col).toHaveProperty('id')
      expect(col).toHaveProperty('label')
      expect(col).toHaveProperty('accessor')
      expect(col).toHaveProperty('defaultVisible')
      expect(typeof col.id).toBe('string')
      expect(typeof col.label).toBe('string')
      expect(typeof col.accessor).toBe('function')
      expect(typeof col.defaultVisible).toBe('boolean')
    })
  })

  it('should have unique column IDs', () => {
    const ids = COLUMN_REGISTRY.map((col) => col.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  describe('getDefaultColumnIds', () => {
    it('should return array of default column IDs', () => {
      const defaultIds = getDefaultColumnIds()
      expect(Array.isArray(defaultIds)).toBe(true)
      expect(defaultIds).toHaveLength(8)
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
    })
  })

  describe('getColumnById', () => {
    it('should return column definition for valid ID', () => {
      const emailCol = getColumnById('email')
      expect(emailCol).toBeDefined()
      expect(emailCol.id).toBe('email')
      expect(emailCol.label).toBe('Email')
    })

    it('should return undefined for invalid ID', () => {
      const result = getColumnById('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('Accessor functions', () => {
    it('should extract values from member objects', () => {
      const mockMember = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        slastName: 'Smith',
      }

      const emailCol = getColumnById('email')
      expect(emailCol.accessor(mockMember)).toBe('test@example.com')

      const firstNameCol = getColumnById('firstName')
      expect(firstNameCol.accessor(mockMember)).toBe('John')

      const lastNameCol = getColumnById('lastName')
      expect(lastNameCol.accessor(mockMember)).toBe('Doe Smith')
    })

    it('should handle missing fields gracefully', () => {
      const mockMember = {}

      COLUMN_REGISTRY.forEach((col) => {
        expect(() => col.accessor(mockMember)).not.toThrow()
      })
    })

    it('should handle null/undefined values', () => {
      const mockMember = {
        email: null,
        firstName: undefined,
        lastName: null,
        slastName: null,
      }

      const emailCol = getColumnById('email')
      expect(emailCol.accessor(mockMember)).toBeNull()

      const lastNameCol = getColumnById('lastName')
      expect(lastNameCol.accessor(mockMember)).toBe('')
    })
  })

  describe('Formatter functions', () => {
    it('should format dates correctly', () => {
      const expirationCol = getColumnById('expirationDate')
      expect(expirationCol.formatter).toBeDefined()

      const result = expirationCol.formatter('2024-12-31')
      expect(typeof result).toBe('string')
    })

    it('should format currency correctly', () => {
      const amountCol = getColumnById('lastPaymentAmount')
      expect(amountCol.formatter).toBeDefined()

      const result = amountCol.formatter(100)
      expect(typeof result).toBe('string')
      expect(result).toContain('$')
    })

    it('should handle null values in formatters', () => {
      const expirationCol = getColumnById('expirationDate')
      expect(() => expirationCol.formatter(null)).not.toThrow()

      const amountCol = getColumnById('lastPaymentAmount')
      expect(() => amountCol.formatter(null)).not.toThrow()
    })
  })
})
