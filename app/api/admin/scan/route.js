// app/api/admin/scan/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { callAppsScript } from '../../../../lib/apps-script'
import { invalidateCache } from '../../../../lib/cache'

/**
 * POST /api/admin/scan
 *
 * Fires off an inbox scan via Apps Script and returns immediately.
 * The scan runs asynchronously on Google's servers; we don't wait for results.
 * Cache is invalidated optimistically so the next data fetch picks up changes.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const accessToken = req.auth.accessToken
  if (!accessToken) {
    return NextResponse.json(
      {
        error: 'Sesión expirada',
        details: 'No access token in session. Please sign out and sign in again.',
      },
      { status: 401 }
    )
  }

  // Fire and forget — kick off the Apps Script scan without awaiting the result.
  // The HTTP request payload is small and sent immediately; Google processes it
  // independently regardless of whether this function stays alive.
  callAppsScript(accessToken, 'scan')
    .then(() => invalidateCache())
    .catch(() => {})

  return NextResponse.json({ success: true, message: 'Escaneo iniciado' })
})
