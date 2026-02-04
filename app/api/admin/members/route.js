// app/api/admin/members/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers } from '../../../../lib/google-sheets'

/**
 * GET /api/admin/members
 *
 * Query params:
 * - status: 'active' | 'expired' | 'expiring-soon' (optional)
 * - search: string to match against email or name (optional)
 * - page: page number, 1-indexed (default: 1)
 * - pageSize: items per page (default: 20, max: 100)
 * - refresh: 'true' to bypass cache (optional)
 */
export const GET = auth(async function GET(req) {
  // Auth check - return 401 if not authenticated
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)

    // Parse query params
    const status = searchParams.get('status')
    const search = searchParams.get('search')?.toLowerCase()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
    const forceRefresh = searchParams.get('refresh') === 'true'

    // Fetch data (cached unless refresh=true)
    const { data: allMembers, fromCache } = await getMembers(forceRefresh)

    // Apply filters
    let filteredMembers = allMembers

    if (status) {
      filteredMembers = filteredMembers.filter((m) => m.status === status)
    }

    if (search) {
      filteredMembers = filteredMembers.filter(
        (m) => m.email?.toLowerCase().includes(search) || m.name?.toLowerCase().includes(search)
      )
    }

    // Pagination
    const totalItems = filteredMembers.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const startIndex = (page - 1) * pageSize
    const paginatedMembers = filteredMembers.slice(startIndex, startIndex + pageSize)

    return NextResponse.json({
      data: paginatedMembers,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      meta: {
        fromCache,
        filters: { status, search },
      },
    })
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json(
      {
        error: 'Error al obtener miembros',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
