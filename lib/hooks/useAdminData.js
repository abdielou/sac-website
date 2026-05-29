'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback, useRef, useEffect } from 'react'

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
export function useMembers({ status, search, page = 1, pageSize = 20, enabled = true } = {}) {
  return useQuery({
    queryKey: ['members', { status, search, page, pageSize }],
    enabled,
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
 *
 * Performs optimistic cache update on mutate:
 * - Immediately updates all payment query caches with new classification
 * - On error, rolls back to pre-mutation cache state
 * - On settle (success or error), invalidates both payments and members queries
 *
 * Usage:
 *   const { mutate, isPending } = useClassifyPayment({ onError: (err) => showToast(err) })
 *   mutate({ rowNumber: 5, isMembership: true })
 *   mutate({ rowNumber: 5, isMembership: null }) // clear classification
 *
 * @param {Object} [options]
 * @param {Function} [options.onError] - Callback for error handling (e.g., row-level error display)
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useClassifyPayment({ onError: onErrorCallback } = {}) {
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
    onMutate: async ({ rowNumber, isMembership }) => {
      // Cancel in-flight payment queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['payments'] })

      // Snapshot all payment query caches for rollback
      const previousQueries = queryClient.getQueriesData({ queryKey: ['payments'] })

      // Optimistically update all matching payment caches
      queryClient.setQueriesData({ queryKey: ['payments'] }, (old) => {
        if (!old?.data) return old
        return {
          ...old,
          data: old.data.map((p) => {
            if (p.rowNumber !== rowNumber) return p
            if (isMembership === null) {
              // Clear classification — revert to heuristic
              // MEMBERSHIP_FEE = 25 — cannot import from server-only module
              return {
                ...p,
                is_membership: p.amount >= 25,
                is_membership_explicit: false,
              }
            }
            return {
              ...p,
              is_membership: isMembership,
              is_membership_explicit: true,
            }
          }),
        }
      })

      return { previousQueries }
    },
    onError: (err, variables, context) => {
      // Restore all cached payment queries from snapshot
      context?.previousQueries?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      // Forward to caller for row-level error display
      onErrorCallback?.(err, variables, context)
    },
    onSettled: () => {
      // Always refetch after mutation (success or error) to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

/**
 * Mutation hook for submitting a manual payment
 * Calls POST /api/admin/manual-payment with payment data
 *
 * On success, invalidates members, payments, and stats caches to refresh dashboard
 *
 * Usage:
 *   const { mutate, isPending, error, reset } = useManualPayment()
 *   mutate({ email, phone, amount, date, payment_type, notes })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useManualPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, phone, amount, date, payment_type, notes }) => {
      const res = await fetch('/api/admin/manual-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, amount, date, payment_type, notes }),
      })

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Error al procesar pago')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

/**
 * Mutation hook for creating a workspace account
 * Calls POST /api/admin/create-workspace-account
 *
 * On success, invalidates members cache to refresh dashboard (member's sacEmail changes)
 *
 * Usage:
 *   const { mutate, isPending, error, reset } = useCreateWorkspaceAccount()
 *   mutate({ email, firstName, initial, lastName, slastName, sacEmail, phone })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
/**
 * Mutation hook for admin uploading a member profile photo
 * Calls POST /api/admin/members/[email]/photo
 *
 * On success, invalidates members cache to refresh dashboard
 *
 * Usage:
 *   const { mutate, isPending, error, reset } = useUploadMemberPhoto()
 *   mutate({ email, photo: blob })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUploadMemberPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, photo }) => {
      const formData = new FormData()
      formData.append('photo', photo, 'photo.jpg')

      const res = await fetch(`/api/admin/members/${encodeURIComponent(email)}/photo`, {
        method: 'POST',
        body: formData,
      })

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Error al subir foto')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

/**
 * Mutation hook for admin updating a member's family names list
 * Calls PUT /api/admin/members/[email]/family-members
 *
 * Usage:
 *   const { mutate, isPending } = useUpdateFamilyMembers()
 *   mutate({ email, names: ['María López', 'Juan Pérez'] })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateFamilyMembers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, names }) => {
      const res = await fetch(`/api/admin/members/${encodeURIComponent(email)}/family-members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Error al actualizar familiares')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

/**
 * Mutation hook for admin uploading a family member photo
 * Calls POST /api/admin/members/[email]/family/[familyName]/photo
 *
 * Usage:
 *   const { mutate, isPending } = useUploadFamilyPhoto()
 *   mutate({ email, familyDisplayName: 'María López', photo: blob })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUploadFamilyPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, familyDisplayName, photo }) => {
      const formData = new FormData()
      formData.append('photo', photo, 'photo.jpg')

      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(email)}/family/${encodeURIComponent(familyDisplayName)}/photo`,
        {
          method: 'POST',
          body: formData,
        }
      )

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Error al subir foto')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

async function waitForAppsScriptOperation({ pollIntervalMs = 3000, maxWaitMs = 360000 } = {}) {
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

    const statusRes = await fetch('/api/admin/scan/status')
    if (!statusRes.ok) continue

    const statusData = await statusRes.json()
    if (!statusData.scanning) return
  }

  throw new Error('Tiempo de espera agotado. La cuenta puede estar creándose aún.')
}

async function verifyMemberSacEmail(email, sacEmail) {
  const membersRes = await fetch(
    `/api/admin/members?search=${encodeURIComponent(email)}&pageSize=10&refresh=true`
  )
  if (!membersRes.ok) {
    throw new Error('No se pudo verificar la cuenta creada')
  }

  const membersData = await membersRes.json()
  const member = membersData.members?.find((m) => m.email?.toLowerCase() === email.toLowerCase())
  if (member?.sacEmail === sacEmail) {
    return { success: true, sacEmail }
  }

  throw new Error('La cuenta no se creó correctamente. Verifique el listado de miembros.')
}

export function useCreateWorkspaceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data) => {
      const res = await fetch('/api/admin/create-workspace-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.details || error.error || 'Error al crear cuenta de Workspace')
      }

      const startResult = await res.json()
      if (!startResult.started) {
        return startResult
      }

      await waitForAppsScriptOperation()
      return verifyMemberSacEmail(data.email, data.sacEmail)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

/**
 * Hook for triggering inbox scan via POST /api/admin/scan
 *
 * Fire-and-forget: the API kicks off the Apps Script scan and returns immediately.
 * Then polls GET /api/admin/scan/status every few seconds to detect completion.
 * On completion, invalidates dashboard caches and shows success state.
 *
 * @returns {{ scan: Function, isScanning: boolean, status: string, error: string|null, reset: Function }}
 */
export function useScan() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('idle') // 'idle' | 'scanning' | 'success' | 'error'
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  const POLL_INTERVAL_MS = 5000
  const SUCCESS_RESET_MS = 5000

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [stopPolling])

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['members'] })
    queryClient.invalidateQueries({ queryKey: ['payments'] })
  }, [queryClient])

  const startPolling = useCallback(() => {
    stopPolling()
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/scan/status')
        if (!res.ok) return // keep polling on transient errors
        const data = await res.json()
        if (!data.scanning) {
          stopPolling()
          invalidateDashboard()
          setStatus('success')
          timeoutRef.current = setTimeout(() => {
            setStatus('idle')
            timeoutRef.current = null
          }, SUCCESS_RESET_MS)
        }
      } catch {
        // network error — keep polling
      }
    }, POLL_INTERVAL_MS)
  }, [stopPolling, invalidateDashboard])

  const scan = useCallback(async () => {
    if (status === 'scanning') return

    setStatus('scanning')
    setError(null)

    try {
      const res = await fetch('/api/admin/scan', { method: 'POST' })

      handleAuthError(res)

      if (res.ok) {
        startPolling()
        return
      }

      const errData = await res.json().catch(() => ({ error: 'Error desconocido' }))
      setStatus('error')
      setError(errData.details || errData.message || errData.error || 'Error al ejecutar escaneo')
    } catch (err) {
      setStatus('error')
      setError(err.message === 'Session expired' ? err.message : 'Error de conexion')
    }
  }, [status, startPolling])

  const reset = useCallback(() => {
    stopPolling()
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setStatus('idle')
    setError(null)
  }, [stopPolling])

  return {
    scan,
    isScanning: status === 'scanning',
    status,
    error,
    reset,
  }
}
