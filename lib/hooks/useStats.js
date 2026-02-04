'use client'

import { useMembers } from './useAdminData'

/**
 * Hook for derived dashboard statistics
 * Fetches all members and computes summary stats
 *
 * @returns {Object} stats, isPending, isError, error
 */
export function useStats() {
  // Fetch ALL records for accurate totals (use large pageSize)
  const members = useMembers({ pageSize: 9999 })

  // Derive stats from data arrays (API returns { data: [...], pagination: {...} })
  const membersData = members.data?.data || []

  const total = members.data?.pagination?.totalItems ?? 0
  const active = membersData.filter((m) => m.status === 'active').length
  const expiringSoon = membersData.filter((m) => m.status === 'expiring-soon').length
  const expired = membersData.filter((m) => m.status === 'expired').length

  return {
    stats: {
      total,
      active,
      expiringSoon,
      expired,
    },
    isPending: members.isPending,
    isError: members.isError,
    error: members.error,
  }
}
