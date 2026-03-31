'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * PermissionGate - Client-side route guard for admin feature pages.
 * Redirects to /admin if user lacks the required permission.
 *
 * @param {string} permission - Required permission (e.g., 'read_members', 'write_guides')
 * @param {React.ReactNode} children - Page content to render if permitted
 */
export default function PermissionGate({ permission, children }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const perms = session?.user?.accessibleActions || []
  const hasPermission = perms.includes(permission)

  useEffect(() => {
    if (status === 'authenticated' && !hasPermission) {
      router.replace('/admin')
    }
  }, [status, hasPermission, router])

  // Loading session
  if (status === 'loading') return null

  // No permission — will redirect
  if (!hasPermission) return null

  return children
}
