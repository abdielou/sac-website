import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { searchCatalog, getObjectById, browseCatalog } from '@/lib/catalog'

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

    // No query — browse catalog (brightest first, optionally filtered by type)
    if (!q || !q.trim()) {
      const results = browseCatalog({ type, limit })
      return NextResponse.json({ results, total: results.length })
    }

    // Try exact ID lookup first, then fall back to text search
    const exactMatch = getObjectById(q.trim())
    const searchResults = searchCatalog(q.trim(), { type, limit })

    // If exact match found and not already in search results, prepend it
    let results = searchResults
    if (exactMatch && !searchResults.some((r) => r.id === exactMatch.id)) {
      results = [exactMatch, ...searchResults].slice(0, limit)
    }

    return NextResponse.json({ results, total: results.length })
  } catch (error) {
    console.error('Error searching catalog:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
