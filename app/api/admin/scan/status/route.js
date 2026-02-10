// app/api/admin/scan/status/route.js
import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { callAppsScript } from '../../../../../lib/apps-script'

/**
 * GET /api/admin/scan/status
 *
 * Checks whether an inbox scan is currently running by probing the
 * Apps Script lock. Returns { scanning: true/false }.
 */
export const GET = auth(async function GET(req) {
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
    const result = await callAppsScript(accessToken, 'scan_status', {}, { timeout: 10000 })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al verificar estado', details: error.message },
      { status: 500 }
    )
  }
})
