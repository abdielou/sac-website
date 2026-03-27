import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { searchCatalog } from '@/lib/catalog'

/**
 * GET /api/admin/catalog/search
 *
 * Query params:
 * - q: search text (required)
 * - type: object type filter (optional, e.g., "Galaxy")
 * - limit: max results (default 20, cap 50)
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    const type = searchParams.get('type') || undefined
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    if (!q || !q.trim()) {
      return NextResponse.json(
        { error: 'Parametro de busqueda requerido', details: 'Query parameter q is required' },
        { status: 400 }
      )
    }

    const results = searchCatalog(q.trim(), { type, limit })

    return NextResponse.json({ results, total: results.length })
  } catch (error) {
    console.error('Error searching catalog:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
