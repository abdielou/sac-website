// app/api/admin/scan/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { callAppsScript } from '../../../../lib/apps-script'
import { invalidateCache } from '../../../../lib/cache'

/**
 * POST /api/admin/scan
 *
 * Triggers an inbox scan via Apps Script web app.
 * Scans Gmail for new ATH Movil and PayPal payment emails.
 * Returns scan summary on success.
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

  try {
    const result = await callAppsScript(accessToken, 'scan')

    if (!result.success) {
      // Map known Apps Script errors to HTTP status codes
      const status = result.error === 'SCAN_IN_PROGRESS' ? 409 : 500
      return NextResponse.json({ error: result.error, message: result.message }, { status })
    }

    // Scan may have added new members/payments - invalidate cache
    invalidateCache()

    return NextResponse.json(result)
  } catch (error) {
    const isTimeout = error.name === 'AbortError'
    return NextResponse.json(
      {
        error: isTimeout ? 'Tiempo de espera agotado' : 'Error al ejecutar escaneo',
        details: error.message,
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
})
