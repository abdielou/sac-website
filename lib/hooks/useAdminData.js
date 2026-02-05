'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'

/**
 * Handle 401 responses by redirecting to sign-in
 * @param {Response} res - Fetch response
 */
function handleAuthError(res) {
  if (res.status === 401) {
    // Session expired or not authenticated - redirect to sign-in
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/signin'
    }
    throw new Error('Session expired')
  }
}

/**
 * Fetch members from API with optional filters
 * @param {Object} options
 * @param {string} [options.status] - Filter by status: 'active', 'expired', 'expiring-soon'
 * @param {string} [options.search] - Search by email or name
 * @param {number} [options.page=1] - Page number (1-indexed)
 * @param {number} [options.pageSize=20] - Items per page
 */
export function useMembers({ status, search, page = 1, pageSize = 20 } = {}) {
  return useQuery({
    queryKey: ['members', { status, search, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (search) params.set('search', search)
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())

      const res = await fetch(`/api/admin/members?${params}`)

      // Handle 401 - redirect to sign-in
      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Failed to fetch members')
      }

      return res.json()
    },
  })
}

/**
 * Fetch payments from API with optional filters
 * @param {Object} options
 * @param {string} [options.source] - Filter by source: 'ath_movil', 'paypal'
 * @param {string} [options.from] - Start date (YYYY-MM-DD)
 * @param {string} [options.to] - End date (YYYY-MM-DD)
 * @param {string} [options.search] - Search by email
 * @param {number} [options.page=1] - Page number (1-indexed)
 * @param {number} [options.pageSize=20] - Items per page
 */
export function usePayments({ source, from, to, search, page = 1, pageSize = 20 } = {}) {
  return useQuery({
    queryKey: ['payments', { source, from, to, search, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (source) params.set('source', source)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (search) params.set('search', search)
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())

      const res = await fetch(`/api/admin/payments?${params}`)

      // Handle 401 - redirect to sign-in
      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Failed to fetch payments')
      }

      return res.json()
    },
  })
}

/**
 * Hook for refreshing all admin data
 * Returns a function that clears server cache, then invalidates client queries
 */
export function useRefreshData() {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)

    try {
      // Step 1: Clear server cache
      const res = await fetch('/api/admin/refresh', { method: 'POST' })

      // Handle 401 - redirect to sign-in
      handleAuthError(res)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.details || errData.error || 'Failed to refresh')
      }

      // Step 2: Invalidate all admin queries (triggers refetch)
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      await queryClient.invalidateQueries({ queryKey: ['payments'] })

      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setIsRefreshing(false)
    }
  }, [queryClient])

  return { refresh, isRefreshing, error }
}

/**
 * Mutation hook for classifying a payment as membership or non-membership
 * Calls PUT /api/admin/payments/:rowNumber/classify
 * Invalidates payments and members queries on settle (success or error)
 *
 * Usage:
 *   const { mutate, isPending } = useClassifyPayment()
 *   mutate({ rowNumber: 5, isMembership: true })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useClassifyPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ rowNumber, isMembership }) => {
      const res = await fetch(`/api/admin/payments/${rowNumber}/classify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_membership: isMembership }),
      })

      // Handle 401 - redirect to sign-in
      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Failed to classify payment')
      }

      return res.json()
    },
    onSettled: () => {
      // Always refetch after mutation (success or error) to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}
