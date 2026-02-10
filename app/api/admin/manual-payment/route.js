// app/api/admin/manual-payment/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { callAppsScript } from '../../../../lib/apps-script'
import { invalidateCache } from '../../../../lib/cache'

/**
 * POST /api/admin/manual-payment
 *
 * Insert and process a manual payment via Apps Script web app.
 *
 * Request body:
 * - email: string (required) - member email
 * - phone: string (optional) - member phone
 * - amount: number (required) - payment amount
 * - date: string (required) - payment date (YYYY-MM-DD or similar)
 * - payment_type: 'GIFT' | 'MANUAL' (required)
 * - notes: string (optional) - additional notes
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
    const body = await req.json()

    // Validate required fields before calling Apps Script
    const { email, amount, date, payment_type } = body
    if (!email || amount == null || !date || !payment_type) {
      return NextResponse.json(
        {
          error: 'Campos requeridos faltantes',
          details: 'Required: email, amount, date, payment_type',
        },
        { status: 400 }
      )
    }

    // Validate payment_type is one of allowed values
    const allowedTypes = ['GIFT', 'MANUAL']
    if (!allowedTypes.includes(payment_type)) {
      return NextResponse.json(
        {
          error: 'Tipo de pago no valido',
          details: `payment_type must be one of: ${allowedTypes.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const result = await callAppsScript(accessToken, 'manual_payment', {
      email: body.email,
      phone: body.phone || '',
      amount: body.amount,
      date: body.date,
      payment_type: body.payment_type,
      notes: body.notes || '',
    })

    if (!result.success) {
      const status = result.error === 'OPERATION_IN_PROGRESS' ? 409 : 500
      return NextResponse.json(
        { error: result.error, cleanup: result.cleanup || false },
        { status }
      )
    }

    // Manual payment processed - invalidate cache
    invalidateCache()

    return NextResponse.json(result)
  } catch (error) {
    const isTimeout = error.name === 'AbortError'
    return NextResponse.json(
      {
        error: isTimeout ? 'Tiempo de espera agotado' : 'Error al procesar pago manual',
        details: error.message,
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
})
