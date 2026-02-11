// app/api/admin/members/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMembers } from '../../../../lib/google-sheets'

/**
 * GET /api/admin/members
 *
 * Query params:
 * - status: comma-separated list e.g. 'active,expired' or 'members' shortcut (optional)
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
    const pageSizeParam = searchParams.get('pageSize')
    const exportAll = pageSizeParam === 'all'
    const pageSize = exportAll
      ? 5000
      : Math.min(100, Math.max(1, parseInt(pageSizeParam || '20', 10)))
    const forceRefresh = searchParams.get('refresh') === 'true'

    // Fetch data (cached unless refresh=true)
    const { data: allMembers, fromCache } = await getMembers(forceRefresh)

    // Apply filters
    let filteredMembers = allMembers

    if (status) {
      if (status === 'members') {
        // Legacy shortcut: all except "applied"
        filteredMembers = filteredMembers.filter((m) => m.status !== 'applied')
      } else {
        // Support comma-separated statuses (e.g. "active,expired")
        const statuses = status.split(',').map((s) => s.trim())
        filteredMembers = filteredMembers.filter((m) => statuses.includes(m.status))
      }
    }

    if (search) {
      filteredMembers = filteredMembers.filter(
        (m) => m.email?.toLowerCase().includes(search) || m.name?.toLowerCase().includes(search)
      )
    }

    // Pagination (skip when exporting all)
    const totalItems = filteredMembers.length
    const paginatedMembers = exportAll
      ? filteredMembers
      : filteredMembers.slice((page - 1) * pageSize, page * pageSize)
    const totalPages = exportAll ? 1 : Math.ceil(totalItems / pageSize)

    return NextResponse.json({
      data: paginatedMembers,
      pagination: {
        page: exportAll ? 1 : page,
        pageSize: exportAll ? totalItems : pageSize,
        totalItems,
        totalPages,
        hasNextPage: !exportAll && page < totalPages,
        hasPrevPage: !exportAll && page > 1,
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
