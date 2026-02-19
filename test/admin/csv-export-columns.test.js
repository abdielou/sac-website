// test/admin/csv-export-columns.test.js
// Tests for CSV export with column customization

import { COLUMN_REGISTRY, getDefaultColumnIds } from '@/lib/admin/columnRegistry'
import { toCsv } from '@/lib/csv'

describe('CSV Export with Column Customization', () => {
  const mockMembers = [
    {
      id: '1',
      email: 'john@example.com',
      sacEmail: 'john.sac@example.com',
      phone: '555-0001',
      firstName: 'John',
      initial: 'M',
      lastName: 'Doe',
      slastName: 'Smith',
      name: 'John M. Doe Smith',
      expirationDate: '2024-12-31',
      status: 'active',
      monthsSincePayment: 2,
      lastPaymentAmount: 100,
      lastPaymentDate: '2024-10-15',
      lastPaymentNotes: 'Annual membership',
      lastPaymentSource: 'stripe',
    },
    {
      id: '2',
      email: 'jane@example.com',
      sacEmail: 'jane.sac@example.com',
      phone: '555-0002',
      firstName: 'Jane',
      initial: 'A',
      lastName: 'Johnson',
      slastName: null,
      name: 'Jane A. Johnson',
      expirationDate: '2024-11-30',
      status: 'expiring-soon',
      monthsSincePayment: 1,
      lastPaymentAmount: 50,
      lastPaymentDate: '2024-11-01',
      lastPaymentNotes: null,
      lastPaymentSource: 'paypal',
    },
  ]

  describe('CSV columns match visible table columns', () => {
    it('should include only visible columns in CSV with default selection', () => {
      const defaultIds = getDefaultColumnIds()
      const visibleColumns = COLUMN_REGISTRY.filter((col) => defaultIds.includes(col.id))

      // Build columns array as done in handleExportCsv
      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      expect(columns).toHaveLength(8)
      expect(columns.map((c) => c.key)).toEqual([
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

    it('should include only visible columns in CSV with custom selection', () => {
      const customIds = ['email', 'firstName', 'phone', 'id']
      const visibleColumns = COLUMN_REGISTRY.filter((col) => customIds.includes(col.id))

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      expect(columns).toHaveLength(4)
      expect(columns.map((c) => c.key)).toEqual(['email', 'firstName', 'phone', 'id'])
    })

    it('should use same labels as table headers', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        ['email', 'firstName', 'lastName'].includes(col.id)
      )

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      expect(columns[0].label).toBe('Email')
      expect(columns[1].label).toBe('Nombre')
      expect(columns[2].label).toBe('Apellidos')
    })

    it('should maintain same column order as table', () => {
      const customIds = ['status', 'email', 'firstName']
      const visibleColumns = COLUMN_REGISTRY.filter((col) => customIds.includes(col.id))

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      // Order should match COLUMN_REGISTRY order, not customIds order
      expect(columns.map((c) => c.key)).toEqual(['email', 'firstName', 'status'])
    })

    it('should apply formatters in CSV export', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        ['expirationDate', 'lastPaymentAmount'].includes(col.id)
      )

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      // Test that formatters are applied
      const expirationCol = columns.find((c) => c.key === 'expirationDate')
      const amountCol = columns.find((c) => c.key === 'lastPaymentAmount')

      expect(expirationCol).toBeDefined()
      expect(amountCol).toBeDefined()

      const formattedDate = expirationCol.value(mockMembers[0])
      const formattedAmount = amountCol.value(mockMembers[0])

      expect(typeof formattedDate).toBe('string')
      expect(typeof formattedAmount).toBe('string')
    })

    it('should handle all available columns in CSV export', () => {
      // Test that all columns can be exported
      const allColumns = COLUMN_REGISTRY.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      expect(allColumns).toHaveLength(COLUMN_REGISTRY.length)

      // Test that all columns can extract values without errors
      allColumns.forEach((col) => {
        expect(() => col.value(mockMembers[0])).not.toThrow()
      })
    })

    it('should generate valid CSV with custom columns', () => {
      const customIds = ['email', 'firstName', 'status']
      const visibleColumns = COLUMN_REGISTRY.filter((col) => customIds.includes(col.id))

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      const csv = toCsv(mockMembers, columns)

      expect(csv).toBeTruthy()
      expect(typeof csv).toBe('string')
      expect(csv).toContain('Email')
      expect(csv).toContain('Nombre')
      expect(csv).toContain('Estado')
      expect(csv).toContain('john@example.com')
      expect(csv).toContain('Jane')
    })
  })

  describe('CSV export with default columns', () => {
    it('should match current export behavior with default columns', () => {
      const defaultIds = getDefaultColumnIds()
      const visibleColumns = COLUMN_REGISTRY.filter((col) => defaultIds.includes(col.id))

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      const csv = toCsv(mockMembers, columns)

      // Verify all default columns are present
      expect(csv).toContain('Email')
      expect(csv).toContain('SAC Email')
      expect(csv).toContain('Nombre')
      expect(csv).toContain('Inicial')
      expect(csv).toContain('Apellidos')
      expect(csv).toContain('Vencimiento')
      expect(csv).toContain('Estado')
      expect(csv).toContain('Ultimo Pago')
    })
  })

  describe('CSV export edge cases', () => {
    it('should handle null values in CSV export', () => {
      const memberWithNulls = {
        ...mockMembers[0],
        sacEmail: null,
        phone: null,
        lastPaymentNotes: null,
      }

      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        ['email', 'sacEmail', 'phone', 'lastPaymentNotes'].includes(col.id)
      )

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value || '-'
        },
      }))

      expect(() => toCsv([memberWithNulls], columns)).not.toThrow()
    })

    it('should handle empty member list', () => {
      const visibleColumns = COLUMN_REGISTRY.filter((col) =>
        getDefaultColumnIds().includes(col.id)
      )

      const columns = visibleColumns.map((col) => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        },
      }))

      const csv = toCsv([], columns)

      expect(csv).toBeTruthy()
      // Should still have headers
      expect(csv).toContain('Email')
    })
  })
})
