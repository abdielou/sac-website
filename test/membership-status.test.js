// Membership Status Calculation Tests
// Tests for calendar-year-based membership expiration rules

// Mock heavy dependencies so google-sheets.js can be imported without loading
// google-spreadsheet (which transitively loads ESM-only 'ky')
jest.mock('google-spreadsheet', () => ({ GoogleSpreadsheet: jest.fn() }))
jest.mock('google-auth-library', () => ({ JWT: jest.fn() }))
jest.mock('../lib/cache', () => ({
  getCachedData: jest.fn(),
  invalidateCache: jest.fn(),
  CACHE_KEYS: { MEMBERS: 'members', PAYMENTS: 'payments' },
}))

import { calculateMembershipStatus } from '../lib/google-sheets'

describe('calculateMembershipStatus — calendar-year rules', () => {
  // Helper to create a Date at midnight UTC
  const d = (year, month, day) => new Date(Date.UTC(year, month - 1, day))

  // ───── EXP-01 / EXP-03: H1 payment (Jan–Jun) → active, expires Dec 31 same year ─────
  describe('EXP-01/EXP-03: H1 payment → active, same-year Dec 31 expiration', () => {
    it('Jan 15 2025 payment, now Jun 1 2025 → active, expires Dec 31 2025', () => {
      const result = calculateMembershipStatus(d(2025, 1, 15), false, d(2025, 6, 1))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2025)
      expect(result.expirationDate.getMonth()).toBe(11) // December
      expect(result.expirationDate.getDate()).toBe(31)
      expect(typeof result.monthsSincePayment).toBe('number')
    })

    it('Jun 30 2025 payment, now Nov 1 2025 → active, expires Dec 31 2025 (H1 boundary)', () => {
      const result = calculateMembershipStatus(d(2025, 6, 30), false, d(2025, 11, 1))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2025)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Jan 1 2025 payment, now Dec 31 2025 → active (last day of coverage)', () => {
      const result = calculateMembershipStatus(d(2025, 1, 1), false, d(2025, 12, 31))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2025)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })
  })

  // ───── EXP-02 / EXP-03: H2 payment (Jul–Dec) → active, expires Dec 31 next year ─────
  describe('EXP-02/EXP-03: H2 payment → active, next-year Dec 31 expiration', () => {
    it('Jul 1 2025 payment, now Nov 1 2025 → active, expires Dec 31 2026', () => {
      const result = calculateMembershipStatus(d(2025, 7, 1), false, d(2025, 11, 1))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2026)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Oct 15 2025 payment, now Mar 1 2026 → active, expires Dec 31 2026', () => {
      const result = calculateMembershipStatus(d(2025, 10, 15), false, d(2026, 3, 1))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2026)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Dec 31 2025 payment, now Jun 1 2026 → active, expires Dec 31 2026 (H2 boundary)', () => {
      const result = calculateMembershipStatus(d(2025, 12, 31), false, d(2026, 6, 1))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2026)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Jul 1 2024 payment, now Dec 31 2025 → active (H2 coverage through end of next year)', () => {
      const result = calculateMembershipStatus(d(2024, 7, 1), false, d(2025, 12, 31))
      expect(result.status).toBe('active')
      expect(result.expirationDate.getFullYear()).toBe(2025)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })
  })

  // ───── EXP-04: Grace period — expiring-soon in Jan–Feb after coverage ends ─────
  describe('EXP-04: Grace period — expiring-soon during Jan–Feb after coverage end', () => {
    it('Mar 1 2024 payment, now Jan 15 2025 → expiring-soon, expires Dec 31 2024', () => {
      const result = calculateMembershipStatus(d(2024, 3, 1), false, d(2025, 1, 15))
      expect(result.status).toBe('expiring-soon')
      expect(result.expirationDate.getFullYear()).toBe(2024)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Mar 1 2024 payment, now Feb 28 2025 → expiring-soon (last day of grace)', () => {
      const result = calculateMembershipStatus(d(2024, 3, 1), false, d(2025, 2, 28))
      expect(result.status).toBe('expiring-soon')
      expect(result.expirationDate.getFullYear()).toBe(2024)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Oct 1 2023 payment, now Jan 15 2025 → expiring-soon (H2→next year, then grace)', () => {
      const result = calculateMembershipStatus(d(2023, 10, 1), false, d(2025, 1, 15))
      expect(result.status).toBe('expiring-soon')
      expect(result.expirationDate.getFullYear()).toBe(2024)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })
  })

  // ───── EXP-05: Expired after grace period ─────
  describe('EXP-05: Expired after grace period (Mar+ following coverage end)', () => {
    it('Mar 1 2024 payment, now Mar 1 2025 → expired, expires Dec 31 2024', () => {
      const result = calculateMembershipStatus(d(2024, 3, 1), false, d(2025, 3, 1))
      expect(result.status).toBe('expired')
      expect(result.expirationDate.getFullYear()).toBe(2024)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Oct 1 2023 payment, now Mar 1 2025 → expired (past grace for Dec 31 2024)', () => {
      const result = calculateMembershipStatus(d(2023, 10, 1), false, d(2025, 3, 1))
      expect(result.status).toBe('expired')
      expect(result.expirationDate.getFullYear()).toBe(2024)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })
  })

  // ───── EXP-06: 2+ year old expiration — no grace period ─────
  describe('EXP-06: 2+ year old coverage — expired (no grace period)', () => {
    it('Jan 1 2023 payment, now Jan 15 2025 → expired (coverage ended Dec 31 2023)', () => {
      const result = calculateMembershipStatus(d(2023, 1, 1), false, d(2025, 1, 15))
      expect(result.status).toBe('expired')
      expect(result.expirationDate.getFullYear()).toBe(2023)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })

    it('Jul 1 2022 payment, now Jan 15 2025 → expired (coverage ended Dec 31 2023)', () => {
      const result = calculateMembershipStatus(d(2022, 7, 1), false, d(2025, 1, 15))
      expect(result.status).toBe('expired')
      expect(result.expirationDate.getFullYear()).toBe(2023)
      expect(result.expirationDate.getMonth()).toBe(11)
      expect(result.expirationDate.getDate()).toBe(31)
    })
  })

  // ───── EXP-07: No payment edge cases ─────
  describe('EXP-07: No payment edge cases', () => {
    it('null payment, hasSacEmail=false → applied, null expiration', () => {
      const result = calculateMembershipStatus(null, false)
      expect(result.status).toBe('applied')
      expect(result.expirationDate).toBeNull()
      expect(result.monthsSincePayment).toBeNull()
    })

    it('null payment, hasSacEmail=true → expired, null expiration', () => {
      const result = calculateMembershipStatus(null, true)
      expect(result.status).toBe('expired')
      expect(result.expirationDate).toBeNull()
      expect(result.monthsSincePayment).toBeNull()
    })
  })
})
