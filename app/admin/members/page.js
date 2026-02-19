'use client'

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useMembers } from '@/lib/hooks/useAdminData'
import { StatusBadge, statusConfig } from '@/components/admin/StatusBadge'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'
import { PaymentTooltip } from '@/components/admin/PaymentTooltip'
import { MemberActions } from '@/components/admin/MemberActions'
import { ManualPaymentModal } from '@/components/admin/ManualPaymentModal'
import { WorkspaceAccountModal } from '@/components/admin/WorkspaceAccountModal'
import { toCsv, downloadCsvFile } from '@/lib/csv'
import { COLUMN_REGISTRY } from '@/lib/admin/columnRegistry'
import { useColumnPreferences } from '@/lib/hooks/useColumnPreferences'
import { ColumnSelector } from '@/components/admin/ColumnSelector'

/**
 * MembersContent - Main content component for members list
 * Handles URL params, filtering, pagination, and data display
 */
function MembersContent() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()

  const accessibleActions = session?.user?.accessibleActions || []
  const canDownloadCsv = accessibleActions.includes('download_csv_members')

  // Column customization
  const { visibleColumns, visibleColumnIds, toggleColumn, resetToDefault } = useColumnPreferences()

  /**
   * Render cell content with special handling for specific columns
   */
  const renderCellContent = (col, member) => {
    const value = col.accessor(member)
    const formattedValue = col.formatter ? col.formatter(value) : value

    // Special rendering for email columns (with copy button)
    if (col.id === 'email' || col.id === 'sacEmail') {
      if (!value) {
        return col.id === 'sacEmail' ? (
          <span className="text-gray-400">-</span>
        ) : (
          '-'
        )
      }
      return (
        <span className="inline-flex items-center gap-2">
          {value}
          {copiedEmail === value ? (
            <span className="text-gray-500 dark:text-gray-400 text-xs">Copied!</span>
          ) : (
            <button
              onClick={() => handleCopyEmail(value)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
              title="Copiar email"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          )}
        </span>
      )
    }

    // Special rendering for status column (with badge)
    if (col.id === 'status') {
      return <StatusBadge status={value} />
    }

    // Special rendering for lastPayment column (with tooltip)
    if (col.id === 'lastPayment') {
      if (member.lastPaymentAmount) {
        return (
          <span className="inline-flex items-center gap-2">
            <span className="text-sm text-gray-900 dark:text-white">
              {formattedValue || '-'}
            </span>
            <PaymentTooltip
              date={member.lastPaymentDate}
              amount={member.lastPaymentAmount}
              notes={member.lastPaymentNotes}
              source={member.lastPaymentSource}
            />
          </span>
        )
      }
      return <span className="text-sm text-gray-400">-</span>
    }

    // Default rendering for all other columns
    return formattedValue || '-'
  }

  // Read filters from URL params
  const statusParam = searchParams.get('status')
  // Default: active, expiring-soon, expired (all except applied)
  const ALL_STATUSES = ['active', 'expiring-soon', 'expired', 'applied']
  const DEFAULT_STATUSES = ['active', 'expiring-soon']
  const selectedStatuses =
    statusParam === null
      ? DEFAULT_STATUSES
      : statusParam === ''
        ? ALL_STATUSES
        : statusParam.split(',').filter(Boolean)
  const status = selectedStatuses.length === ALL_STATUSES.length ? '' : selectedStatuses.join(',')
  const searchParam = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

  // Local state for search input (prevents focus loss during debounce)
  const [searchInput, setSearchInput] = useState(searchParam)
  const [copiedEmail, setCopiedEmail] = useState(null)
  const [modalState, setModalState] = useState({ isOpen: false, member: null, paymentType: null })
  const [workspaceModalState, setWorkspaceModalState] = useState({ isOpen: false, member: null })
  const [isExporting, setIsExporting] = useState(false)
  const debounceRef = useRef(null)

  // Copy email to clipboard and show feedback
  const handleCopyEmail = (email) => {
    navigator.clipboard.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 1500)
  }

  const handleAction = (member, paymentType) => {
    if (paymentType === 'WORKSPACE') {
      setWorkspaceModalState({ isOpen: true, member })
    } else {
      setModalState({ isOpen: true, member, paymentType })
    }
  }

  const handleCloseModal = () => {
    setModalState({ isOpen: false, member: null, paymentType: null })
  }

  const handleCloseWorkspaceModal = () => {
    setWorkspaceModalState({ isOpen: false, member: null })
  }

  // Sync local state when URL param changes externally
  useEffect(() => {
    setSearchInput(searchParam)
  }, [searchParam])

  // Fetch members with current filters (no search - we'll filter client-side)
  const { data: apiData, isPending, isError, error, refetch } = useMembers({
    status: status || undefined,
    search: undefined, // Don't filter on server - we'll do it client-side based on visible columns
    page: 1,
    pageSize: 5000, // Fetch all to filter client-side
  })

  // Client-side filtering based on visible columns and search term
  const filteredMembers = useMemo(() => {
    if (!apiData?.data) return []
    
    let filtered = apiData.data

    // Apply search filter across all visible columns
    if (searchParam) {
      const searchLower = searchParam.toLowerCase()
      filtered = filtered.filter((member) => {
        // Search through all visible columns
        return visibleColumns.some((col) => {
          const value = col.accessor(member)
          if (value == null) return false
          
          // Format the value if formatter exists
          const displayValue = col.formatter ? col.formatter(value) : value
          
          // Convert to string and search
          return String(displayValue).toLowerCase().includes(searchLower)
        })
      })
    }

    return filtered
  }, [apiData?.data, searchParam, visibleColumns])

  // Client-side pagination
  const totalItems = filteredMembers.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const paginatedMembers = filteredMembers.slice((page - 1) * pageSize, page * pageSize)

  const data = {
    data: paginatedMembers,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    meta: apiData?.meta || {},
  }

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true)
    try {
      // Use the already filtered members data instead of making a new API call
      // This ensures CSV export matches what the user sees in the table
      const membersToExport = filteredMembers
      
      // Build columns array from visibleColumns
      const columns = visibleColumns.map(col => ({
        key: col.id,
        label: col.label,
        value: (row) => {
          const value = col.accessor(row)
          return col.formatter ? col.formatter(value) : value
        }
      }))
      
      const csv = toCsv(membersToExport, columns)
      const statusSuffix =
        selectedStatuses.length === ALL_STATUSES.length ? 'all' : selectedStatuses.join('-')
      const searchSuffix = searchParam ? `-${searchParam.replace(/\s+/g, '_')}` : ''
      const date = new Date().toISOString().slice(0, 10)
      downloadCsvFile(csv, `members-${statusSuffix}${searchSuffix}-${date}`)
    } catch (err) {
      console.error('CSV export error:', err)
    } finally {
      setIsExporting(false)
    }
  }, [filteredMembers, visibleColumns, selectedStatuses, searchParam])

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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Miembros</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Status multi-select pills */}
        <div className="flex flex-wrap items-center gap-2">
          {ALL_STATUSES.map((s) => {
            const config = statusConfig[s]
            const isSelected = selectedStatuses.includes(s)
            return (
              <button
                key={s}
                onClick={() => {
                  const next = isSelected
                    ? selectedStatuses.filter((v) => v !== s)
                    : [...selectedStatuses, s]
                  updateFilter('status', next.length === 0 ? '' : next.join(','))
                }}
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full transition-opacity ${
                  isSelected
                    ? config.classes
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                }`}
              >
                {config.label}
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
            placeholder="Buscar por email o nombre..."
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

        {/* Column Selector - Hidden on mobile */}
        <div className="hidden md:block">
          <ColumnSelector
            visibleColumnIds={visibleColumnIds}
            onColumnToggle={toggleColumn}
            onReset={resetToDefault}
          />
        </div>
      </div>

      {/* Loading state - show skeleton table but keep filters visible */}
      {isPending ? (
        <SkeletonTable rows={10} columns={9} />
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-4">
            {members.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
                No se encontraron miembros con los filtros seleccionados.
              </div>
            ) : (
              members.map((member, index) => (
                <div
                  key={member.email || index}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {[member.firstName, member.initial, member.lastName, member.slastName]
                          .filter(Boolean)
                          .join(' ') || '-'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {member.email || '-'}
                        </p>
                        {member.email &&
                          (copiedEmail === member.email ? (
                            <span className="text-gray-500 dark:text-gray-400 text-xs">
                              Copied!
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCopyEmail(member.email)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                          ))}
                      </div>
                      {member.sacEmail && (
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-gray-400 truncate">SAC: {member.sacEmail}</p>
                          {copiedEmail === member.sacEmail ? (
                            <span className="text-gray-500 dark:text-gray-400 text-xs">
                              Copied!
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCopyEmail(member.sacEmail)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={member.status} />
                      <MemberActions member={member} onAction={handleAction} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Vence: {formatDate(member.expirationDate)}
                    </span>
                    {member.lastPaymentAmount ? (
                      <span className="inline-flex items-center gap-1">
                        <span>{formatDate(member.lastPaymentDate)}</span>
                        <PaymentTooltip
                          date={member.lastPaymentDate}
                          amount={member.lastPaymentAmount}
                          notes={member.lastPaymentNotes}
                          source={member.lastPaymentSource}
                        />
                      </span>
                    ) : (
                      <span className="text-gray-400">Sin pagos</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {members.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleColumns.length + 1}
                        className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        No se encontraron miembros con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    members.map((member, index) => (
                      <tr
                        key={member.email || index}
                        className="group hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            className={`px-6 py-4 ${
                              col.id === 'lastPayment' ? 'text-center' : 'whitespace-nowrap'
                            } text-sm text-gray-900 dark:text-white`}
                          >
                            {renderCellContent(col, member)}
                          </td>
                        ))}
                        <td className="px-3 py-4 text-center">
                          <MemberActions member={member} onAction={handleAction} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Mostrando {members.length} de {totalItems} miembros
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

      <ManualPaymentModal
        isOpen={modalState.isOpen}
        onClose={handleCloseModal}
        member={modalState.member}
        paymentType={modalState.paymentType}
      />

      <WorkspaceAccountModal
        isOpen={workspaceModalState.isOpen}
        onClose={handleCloseWorkspaceModal}
        member={workspaceModalState.member}
      />
    </div>
  )
}

/**
 * MembersPage - Main export with Suspense boundary for Next.js 15
 */
export default function MembersPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={10} columns={9} />}>
      <MembersContent />
    </Suspense>
  )
}
