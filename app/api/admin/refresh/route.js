// app/api/admin/refresh/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { invalidateCache } from '../../../../lib/cache'
import { canAccessDashboard } from '../../../../lib/permissions'
import { REFRESH_SCOPES, normalizeRefreshScope } from '../../../../lib/admin/refresh-scope'

/**
 * POST /api/admin/refresh
 *
 * Body: { scope?: 'members' | 'payments' | 'contacts' | 'all' }
 * Clears the server-side cache for that section only. No body or an unknown
 * scope flushes everything. The client invalidates its own query cache next.
 * Requires admin dashboard access.
 */
export const POST = auth(async function POST(req) {
  // Auth check
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Permission check — only admins should flush cache
  if (!canAccessDashboard(req.auth.user?.email)) {
    return NextResponse.json(
      { error: 'Permiso denegado', details: 'Admin access required' },
      { status: 403 }
    )
  }

  let body = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const scope = normalizeRefreshScope(body?.scope)

  try {
    const { cacheKeys } = REFRESH_SCOPES[scope]
    if (cacheKeys) {
      for (const key of cacheKeys) invalidateCache(key)
    } else {
      invalidateCache()
    }

    return NextResponse.json({
      success: true,
      scope,
      message: 'Cache invalidado',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error invalidating cache:', error)
    return NextResponse.json(
      {
        error: 'Error al invalidar cache',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
