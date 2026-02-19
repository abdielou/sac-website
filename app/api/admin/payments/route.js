// app/api/admin/payments/route.js
import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getPayments } from '../../../../lib/google-sheets'
import { checkPermission } from '../../../../lib/api-permissions'
import { Actions } from '../../../../lib/permissions'

/**
 * GET /api/admin/payments
 *
 * Query params:
 * - source: comma-separated list e.g. 'ath_movil,paypal' (optional)
 * - from: YYYY-MM-DD start date (optional)
 * - to: YYYY-MM-DD end date (optional)
 * - search: string to match against email (optional)
 * - page: page number, 1-indexed (default: 1)
 * - pageSize: items per page (default: 20, max: 100)
 * - refresh: 'true' to bypass cache (optional)
 */
export const GET = auth(async function GET(req) {
  // Auth check
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)

    // Parse query params
    const source = searchParams.get('source')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const search = searchParams.get('search')?.toLowerCase()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSizeParam = searchParams.get('pageSize')
    const exportAll = pageSizeParam === 'all'
    
    // Check permission for CSV download (exportAll)
    if (exportAll) {
      const permissionError = checkPermission(req, Actions.DOWNLOAD_CSV_PAYMENTS)
      if (permissionError) {
        return permissionError
      }
    }
    
    const pageSize = exportAll
      ? 5000
      : Math.min(100, Math.max(1, parseInt(pageSizeParam || '20', 10)))
    const forceRefresh = searchParams.get('refresh') === 'true'

    // Fetch data (cached unless refresh=true)
    const { data: allPayments, fromCache } = await getPayments(forceRefresh)

    // Apply filters
    let filteredPayments = allPayments

    if (source) {
      const sources = source.split(',')
      filteredPayments = filteredPayments.filter((p) => sources.includes(p.source))
    }

    if (fromDate) {
      const from = new Date(fromDate)
      filteredPayments = filteredPayments.filter((p) => {
        const paymentDate = new Date(p.date)
        return paymentDate >= from
      })
    }

    if (toDate) {
      const to = new Date(toDate)
      // Set to end of day for inclusive range
      to.setHours(23, 59, 59, 999)
      filteredPayments = filteredPayments.filter((p) => {
        const paymentDate = new Date(p.date)
        return paymentDate <= to
      })
    }

    if (search) {
      filteredPayments = filteredPayments.filter((p) => {
        const email = p.email?.toLowerCase() || ''
        const notes = p.notes?.toLowerCase() || ''
        const amount = String(p.amount || '')
        return email.includes(search) || notes.includes(search) || amount.includes(search)
      })
    }

    // Sort by date (newest first)
    filteredPayments.sort((a, b) => new Date(b.date) - new Date(a.date))

    // Pagination (skip when exporting all)
    const totalItems = filteredPayments.length
    const paginatedPayments = exportAll
      ? filteredPayments
      : filteredPayments.slice((page - 1) * pageSize, page * pageSize)
    const totalPages = exportAll ? 1 : Math.ceil(totalItems / pageSize)

    return NextResponse.json({
      data: paginatedPayments,
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
        filters: { source, from: fromDate, to: toDate, search },
      },
    })
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json(
      {
        error: 'Error al obtener pagos',
        details: error.message,
      },
      { status: 500 }
    )
  }
})
