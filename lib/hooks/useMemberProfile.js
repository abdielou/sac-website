'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Handle 401 responses by redirecting to sign-in
 * @param {Response} res - Fetch response
 */
function handleAuthError(res) {
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/signin'
    }
    throw new Error('Session expired')
  }
}

/**
 * Hook to fetch the authenticated member's own profile.
 * Uses session-scoped GET /api/member/profile (email from session, not params).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useMemberProfile() {
  return useQuery({
    queryKey: ['member-profile'],
    queryFn: async () => {
      const res = await fetch('/api/member/profile')

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(error.details || error.error || 'Error al obtener perfil')
      }

      return res.json()
    },
  })
}

/**
 * Mutation hook for updating the member's own profile.
 * Accepts { fields, photo } where photo is an optional Blob/File.
 *
 * - If photo is provided: sends multipart/form-data with photo file and JSON-stringified fields
 * - If no photo: sends JSON body with fields only
 *
 * On success, invalidates the member-profile query to refetch updated data.
 *
 * Usage:
 *   const { mutate, isPending } = useUpdateMemberProfile()
 *   mutate({ fields: { firstName: 'Juan', phone: '787-555-1234' }, photo: croppedBlob })
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateMemberProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fields, photo }) => {
      let res

      if (photo instanceof Blob || photo instanceof File) {
        // Multipart: include photo file and fields as JSON string
        const formData = new FormData()
        formData.append('photo', photo, 'profile.jpg')
        formData.append('fields', JSON.stringify(fields))

        res = await fetch('/api/member/profile', {
          method: 'PUT',
          body: formData,
        })
      } else {
        // JSON only: fields without photo
        res = await fetch('/api/member/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        })
      }

      handleAuthError(res)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(error.details || error.error || 'Error al actualizar perfil')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-profile'] })
    },
  })
}
