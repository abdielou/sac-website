// app/api/admin/payments/[row]/classify/route.js
import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { classifyPayment } from '../../../../../../lib/google-sheets'

/**
 * PUT /api/admin/payments/[row]/classify
 *
 * Body: { is_membership: boolean|null }
 * Response: { rowNumber: number, is_membership: boolean|null }
 *
 * Writes the is_membership classification to the PAYMENTS sheet row.
 * Pass null to clear classification (revert to heuristic).
 * Invalidates server-side caches for payments and members.
 */
export const PUT = auth(async function PUT(req, { params }) {
  // Auth check
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    // Next.js 15: params is a Promise
    const { row } = await params
    const rowNumber = parseInt(row, 10)

    // Validate row number (must be >= 2 since row 1 is header)
    if (isNaN(rowNumber) || rowNumber < 2) {
      return NextResponse.json(
        { error: 'Fila invalida', details: 'Row number must be an integer >= 2' },
        { status: 400 }
      )
    }

    // Parse and validate body — accepts true, false, or null only
    const body = await req.json()
    const { is_membership } = body

    if (is_membership !== true && is_membership !== false && is_membership !== null) {
      return NextResponse.json(
        { error: 'Valor invalido', details: 'is_membership must be true, false, or null' },
        { status: 400 }
      )
    }

    // Write classification to sheet
    const result = await classifyPayment(rowNumber, is_membership)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error classifying payment:', error)
    return NextResponse.json(
      {
        error: 'Error al clasificar pago',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
