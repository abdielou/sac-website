'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { usePayments } from '@/lib/hooks/useAdminData'
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
  const totalItems = data?.pagination?.total || 0

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
          placeholder="Buscar por email..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Loading state - show skeleton table but keep filters visible */}
      {isPending ? (
        <SkeletonTable rows={10} columns={5} />
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
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {payments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        No se encontraron pagos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment, index) => (
                      <tr
                        key={`${payment.date}-${payment.email}-${index}`}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
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
                      </tr>
                    ))
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
    <Suspense fallback={<SkeletonTable rows={10} columns={5} />}>
      <PaymentsContent />
    </Suspense>
  )
}
