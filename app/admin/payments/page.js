'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { usePayments, useClassifyPayment } from '@/lib/hooks/useAdminData'
import { SourceBadge } from '@/components/admin/SourceBadge'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate, formatCurrency } from '@/lib/formatters'
import { toCsv, downloadCsvFile } from '@/lib/csv'

/**
 * PaymentsContent - Main content component for payments list
 * Handles URL params, filtering, pagination, and data display
 */
function PaymentsContent() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()

  const accessibleActions = session?.user?.accessibleActions || []
  const canEditPayment = accessibleActions.includes('edit_payment')
  const canDownloadCsv = accessibleActions.includes('download_csv_payments')

  // Read filters from URL params
  const ALL_SOURCES = ['ath_movil', 'paypal', 'manual']
  const sourceParam = searchParams.get('source')
  const selectedSources =
    sourceParam === null
      ? ALL_SOURCES
      : sourceParam === ''
        ? ALL_SOURCES
        : sourceParam.split(',').filter(Boolean)
  const source = selectedSources.length === ALL_SOURCES.length ? '' : selectedSources.join(',')
  const searchParam = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

  // Local state for search input (prevents focus loss during debounce)
  const [searchInput, setSearchInput] = useState(searchParam)
  const [isExporting, setIsExporting] = useState(false)
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
    pageSize,
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

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams()
      if (source) params.set('source', source)
      if (searchParam) params.set('search', searchParam)
      params.set('pageSize', 'all')
      const res = await fetch(`/api/admin/payments?${params.toString()}`)
      if (!res.ok) throw new Error('Export failed')
      const json = await res.json()
      const columns = [
        { key: 'date', label: 'Fecha' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Telefono' },
        { key: 'amount', label: 'Monto' },
        { key: 'source', label: 'Fuente' },
        { key: 'notes', label: 'Mensaje' },
        { key: 'is_membership', label: 'Membresia' },
      ]
      const csv = toCsv(json.data, columns)
      downloadCsvFile(csv, `pagos-${new Date().toISOString().slice(0, 10)}`)
    } catch (err) {
      console.error('CSV export error:', err)
    } finally {
      setIsExporting(false)
    }
  }, [source, searchParam])

  /**
   * Three-state cycling:
   * - Explicit true -> explicit false
   * - Explicit false -> unset (heuristic)
   * - Unset (heuristic) -> explicit true
   */
  const handleClassifyClick = (payment) => {
    // Safety guards: MANUAL_PAYMENTS and payments under $25 are not classifiable
    if (payment._sheetName === 'MANUAL_PAYMENTS') return
    if (payment.amount < 25) return

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
        {/* Source multi-select pills */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              value: 'ath_movil',
              label: 'ATH Movil',
              classes: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
            },
            {
              value: 'paypal',
              label: 'PayPal',
              classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            },
            {
              value: 'manual',
              label: 'Manual',
              classes: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
            },
          ].map((opt) => {
            const isSelected = selectedSources.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => {
                  const next = isSelected
                    ? selectedSources.filter((v) => v !== opt.value)
                    : [...selectedSources, opt.value]
                  updateFilter('source', next.length === 0 ? '' : next.join(','))
                }}
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full transition-opacity ${
                  isSelected
                    ? opt.classes
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Buscar por email, monto o mensaje..."
            className="w-full px-3 py-2 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('')
                if (debounceRef.current) clearTimeout(debounceRef.current)
                updateFilter('search', '')
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Limpiar búsqueda"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* CSV Download */}
        {canDownloadCsv && (
          <button
            onClick={handleExportCsv}
            disabled={isExporting || isPending}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {isExporting ? 'Exportando...' : 'CSV'}
          </button>
        )}
      </div>

      {/* Loading state - show skeleton table but keep filters visible */}
      {isPending ? (
        <SkeletonTable rows={10} columns={7} />
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-4">
            {payments.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
                No se encontraron pagos con los filtros seleccionados.
              </div>
            ) : (
              payments.map((payment, index) => {
                const isSaving =
                  classifyMutation.isPending &&
                  classifyMutation.variables?.rowNumber === payment.rowNumber
                const isManual = payment._sheetName === 'MANUAL_PAYMENTS'
                const isUnderMinimum = payment.amount < 25
                const isDisabled = isManual || isUnderMinimum || !canEditPayment
                return (
                  <div
                    key={`${payment.date}-${payment.email}-${index}`}
                    className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3
                      ${rowErrors[payment.rowNumber] ? 'ring-2 ring-red-500' : ''}
                      ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {payment.email}
                        </p>
                        {payment.phone && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {payment.phone}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {formatDate(payment.date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(payment.amount)}
                        </span>
                        <SourceBadge source={payment.source} />
                      </div>
                    </div>
                    {payment.notes && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {payment.notes}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Membresia</span>
                      <div className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={
                            isManual || (payment.is_membership_explicit && payment.is_membership)
                          }
                          disabled={isDisabled}
                          onChange={() => handleClassifyClick(payment)}
                          className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                            isDisabled
                              ? 'opacity-50 cursor-not-allowed'
                              : !payment.is_membership_explicit
                                ? 'opacity-50 cursor-pointer'
                                : 'cursor-pointer'
                          }`}
                        />
                        {!payment.is_membership_explicit && !isDisabled && (
                          <span className="ml-1 text-gray-400 text-xs">?</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
                      Telefono
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
                        colSpan={7}
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {payment.phone || '-'}
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
                            {(() => {
                              const isManual = payment._sheetName === 'MANUAL_PAYMENTS'
                              const isUnderMinimum = payment.amount < 25
                              const isDisabled = isManual || isUnderMinimum || !canEditPayment
                              return (
                                <div className="relative inline-flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={
                                      isManual ||
                                      (payment.is_membership_explicit && payment.is_membership)
                                    }
                                    disabled={isDisabled}
                                    onChange={() => handleClassifyClick(payment)}
                                    className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                      isDisabled
                                        ? 'opacity-50 cursor-not-allowed'
                                        : !payment.is_membership_explicit
                                          ? 'opacity-50 cursor-pointer'
                                          : 'cursor-pointer'
                                    }`}
                                  />
                                  {!payment.is_membership_explicit && !isDisabled && (
                                    <span className="absolute -right-3 text-gray-400 text-xs">
                                      ?
                                    </span>
                                  )}
                                </div>
                              )
                            })()}
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
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {payments.length} de {totalItems} pagos
              </span>
              <select
                value={pageSize}
                onChange={(e) => updateFilter('pageSize', e.target.value)}
                className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="10">10 / pag</option>
                <option value="20">20 / pag</option>
                <option value="50">50 / pag</option>
                <option value="100">100 / pag</option>
              </select>
            </div>
            {totalPages > 1 && (
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
            )}
          </div>
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
    <Suspense fallback={<SkeletonTable rows={10} columns={7} />}>
      <PaymentsContent />
    </Suspense>
  )
}
