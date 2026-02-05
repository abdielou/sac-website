'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useMembers } from '@/lib/hooks/useAdminData'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'
import { PaymentTooltip } from '@/components/admin/PaymentTooltip'

/**
 * MembersContent - Main content component for members list
 * Handles URL params, filtering, pagination, and data display
 */
function MembersContent() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read filters from URL params (default to 'members' to exclude applied)
  const status = searchParams.get('status') ?? 'members'
  const searchParam = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)

  // Local state for search input (prevents focus loss during debounce)
  const [searchInput, setSearchInput] = useState(searchParam)
  const debounceRef = useRef(null)

  // Sync local state when URL param changes externally
  useEffect(() => {
    setSearchInput(searchParam)
  }, [searchParam])

  // Fetch members with current filters
  const { data, isPending, isError, error, refetch } = useMembers({
    status: status || undefined,
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
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Miembros</h1>
        <ErrorState message={error?.message} onRetry={refetch} />
      </div>
    )
  }

  const members = data?.data || []
  const totalPages = data?.pagination?.totalPages || 1
  const totalItems = data?.pagination?.totalItems || 0

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Miembros</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="members">Miembros</option>
          <option value="active">Activo</option>
          <option value="expiring-soon">Vence pronto</option>
          <option value="expired">Expirado</option>
          <option value="applied">Aplicado</option>
          <option value="">Todos</option>
        </select>

        {/* Search input */}
        <input
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Buscar por email o nombre..."
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
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Vencimiento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Ultimo Pago
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {members.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        No se encontraron miembros con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    members.map((member, index) => (
                      <tr
                        key={member.email || index}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {member.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {member.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {formatDate(member.expirationDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={member.status} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          {member.lastPaymentAmount ? (
                            <PaymentTooltip
                              date={member.lastPaymentDate}
                              amount={member.lastPaymentAmount}
                              notes={member.lastPaymentNotes}
                              source={member.lastPaymentSource}
                            />
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
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
                Mostrando {members.length} de {totalItems} miembros
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
 * MembersPage - Main export with Suspense boundary for Next.js 15
 */
export default function MembersPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={10} columns={5} />}>
      <MembersContent />
    </Suspense>
  )
}
