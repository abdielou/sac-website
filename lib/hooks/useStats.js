'use client'

import { useMembers, usePayments } from './useAdminData'

/**
 * Compute sum of payments for current calendar month
 * @param {Array} payments - Array of payment records with date and amount
 * @returns {number} Total amount for current month
 */
function computeMonthlyTotal(payments) {
  if (!payments || !Array.isArray(payments)) return 0

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  return payments
    .filter((p) => new Date(p.date) >= monthStart)
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
}

/**
 * Hook for derived dashboard statistics
 * Fetches all members and payments, then computes summary stats
 *
 * @returns {Object} stats, isPending, isError, error
 */
export function useStats() {
  // Fetch ALL records for accurate totals (use large pageSize)
  const members = useMembers({ pageSize: 9999 })
  const payments = usePayments({ pageSize: 9999 })

  // Derive stats from data arrays
  const membersData = members.data?.members || []
  const paymentsData = payments.data?.payments || []

  const total = members.data?.pagination?.totalItems ?? 0
  const active = membersData.filter((m) => m.status === 'active').length
  const expiringSoon = membersData.filter((m) => m.status === 'expiring-soon').length
  const expired = membersData.filter((m) => m.status === 'expired').length
  const monthlyPayments = computeMonthlyTotal(paymentsData)

  return {
    stats: {
      total,
      active,
      expiringSoon,
      expired,
      monthlyPayments,
    },
    isPending: members.isPending || payments.isPending,
    isError: members.isError || payments.isError,
    error: members.error || payments.error,
  }
}
