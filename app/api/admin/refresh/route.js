// app/api/admin/refresh/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { invalidateCache } from '../../../../lib/cache'

/**
 * POST /api/admin/refresh
 *
 * Clears server-side cache for members and payments.
 * Client should call this before invalidating TanStack Query cache.
 */
export const POST = auth(async function POST(req) {
  // Auth check
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    // Flush all cached data
    invalidateCache()

    return NextResponse.json({
      success: true,
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
