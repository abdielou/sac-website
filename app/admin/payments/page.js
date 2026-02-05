'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { usePayments, useClassifyPayment } from '@/lib/hooks/useAdminData'
import { SourceBadge } from '@/components/admin/SourceBadge'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate, formatCurrency } from '@/lib/formatters'

/**
 * PaymentsContent - Main content component for payments list
 * Handles URL params, filtering, pagination, and data display
 */
function PaymentsContent() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read filters from URL params
  const source = searchParams.get('source') || ''
  const searchParam = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)

  // Local state for search input (prevents focus loss during debounce)
  const [searchInput, setSearchInput] = useState(searchParam)
  const debounceRef = useRef(null)

  // Sync local state when URL param changes externally
  useEffect(() => {
    setSearchInput(searchParam)
  }, [searchParam])

  // Row-level error tracking: { [rowNumber]: errorMessage }
  const [rowErrors, setRowErrors] = useState({})

  // Classification mutation with optimistic updates
  const classifyMutation = useClassifyPayment({
    onError: (_err, variables) => {
      const { rowNumber } = variables
      setRowErrors((prev) => ({ ...prev, [rowNumber]: 'Error al clasificar pago' }))
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        setRowErrors((prev) => {
          const next = { ...prev }
          delete next[rowNumber]
          return next
        })
      }, 3000)
    },
  })

  // Fetch payments with current filters
  const { data, isPending, isError, error, refetch } = usePayments({
    source: source || undefined,
    search: searchParam || undefined,
    page,
    pageSize: 20,
  })

  /**
   * Update URL params when filter changes
   * Always resets to page 1 except when changing page itself
   */
  const updateFilter = (key, value) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    // Reset to page 1 when filter changes (except when changing page)
    if (key !== 'page') {
      params.set('page', '1')
    }

    router.replace(`${pathname}?${params.toString()}`)
  }

  /**
   * Handle search input with debounce to prevent focus loss
   */
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchInput(value)

    // Clear previous debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Debounce URL update by 300ms
    debounceRef.current = setTimeout(() => {
      updateFilter('search', value)
    }, 300)
  }

  /**
   * Three-state cycling:
   * - Explicit true -> explicit false
   * - Explicit false -> unset (heuristic)
   * - Unset (heuristic) -> explicit true
   */
  const handleClassifyClick = (payment) => {
    // Safety guard: MANUAL_PAYMENTS are not classifiable
    if (payment._sheetName === 'MANUAL_PAYMENTS') return

    // Clear any existing error for this row
    setRowErrors((prev) => {
      if (!prev[payment.rowNumber]) return prev
      const next = { ...prev }
      delete next[payment.rowNumber]
      return next
    })

    let nextValue
    if (payment.is_membership_explicit) {
      if (payment.is_membership === true) {
        nextValue = false // explicit true -> explicit false
      } else {
        nextValue = null // explicit false -> clear (heuristic)
      }
    } else {
      nextValue = true // heuristic -> explicit true
    }

    classifyMutation.mutate({ rowNumber: payment.rowNumber, isMembership: nextValue })
  }

  // Error state (show above table, keep filters visible)
  if (isError) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Pagos</h1>
        <ErrorState message={error?.message} onRetry={refetch} />
      </div>
    )
  }

  const payments = data?.data || []
  const totalPages = data?.pagination?.totalPages || 1
  const totalItems = data?.pagination?.totalItems || 0

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Pagos</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Source filter */}
        <select
          value={source}
          onChange={(e) => updateFilter('source', e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Todas las fuentes</option>
          <option value="ath_movil">ATH Movil</option>
          <option value="paypal">PayPal</option>
          <option value="manual">Manual</option>
        </select>

        {/* Search input */}
        <input
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Buscar por email, monto o mensaje..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Loading state - show skeleton table but keep filters visible */}
      {isPending ? (
        <SkeletonTable rows={10} columns={6} />
      ) : (
        <>
          {/* Table container */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Fuente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Mensaje
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Membresia
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {payments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        No se encontraron pagos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment, index) => {
                      const isSaving =
                        classifyMutation.isPending &&
                        classifyMutation.variables?.rowNumber === payment.rowNumber
                      return (
                        <tr
                          key={`${payment.date}-${payment.email}-${index}`}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700
                            ${rowErrors[payment.rowNumber] ? 'ring-2 ring-red-500 ring-inset' : ''}
                            ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {formatDate(payment.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {payment.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <SourceBadge source={payment.source} />
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                            {payment.notes || '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="relative inline-flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={
                                  payment._sheetName === 'MANUAL_PAYMENTS' ||
                                  (payment.is_membership_explicit && payment.is_membership)
                                }
                                disabled={payment._sheetName === 'MANUAL_PAYMENTS'}
                                onChange={() => handleClassifyClick(payment)}
                                className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                  payment._sheetName === 'MANUAL_PAYMENTS'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : !payment.is_membership_explicit
                                      ? 'opacity-50 cursor-pointer'
                                      : 'cursor-pointer'
                                }`}
                              />
                              {!payment.is_membership_explicit &&
                                payment._sheetName !== 'MANUAL_PAYMENTS' && (
                                  <span className="absolute -right-3 text-gray-400 text-xs">?</span>
                                )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {payments.length} de {totalItems} pagos
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => updateFilter('page', String(page - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Pagina {page} de {totalPages}
                </span>
                <button
                  onClick={() => updateFilter('page', String(page + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * PaymentsPage - Main export with Suspense boundary for Next.js 15
 */
export default function PaymentsPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={10} columns={6} />}>
      <PaymentsContent />
    </Suspense>
  )
}
