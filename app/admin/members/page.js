'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
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

/**
 * MembersContent - Main content component for members list
 * Handles URL params, filtering, pagination, and data display
 */
function MembersContent() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

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

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (searchParam) params.set('search', searchParam)
      params.set('pageSize', 'all')
      const res = await fetch(`/api/admin/members?${params.toString()}`)
      if (!res.ok) throw new Error('Export failed')
      const json = await res.json()
      const columns = [
        { key: 'email', label: 'Email' },
        { key: 'sacEmail', label: 'SAC Email' },
        { key: 'name', label: 'Nombre' },
        { key: 'phone', label: 'Telefono' },
        { key: 'expirationDate', label: 'Vencimiento' },
        { key: 'status', label: 'Estado' },
        { key: 'lastPaymentDate', label: 'Fecha Ultimo Pago' },
        { key: 'lastPaymentAmount', label: 'Monto Ultimo Pago' },
        { key: 'lastPaymentSource', label: 'Fuente Ultimo Pago' },
      ]
      const csv = toCsv(json.data, columns)
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
  }, [status, searchParam])

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* CSV Download */}
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
      </div>

      {/* Loading state - show skeleton table but keep filters visible */}
      {isPending ? (
        <SkeletonTable rows={10} columns={7} />
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
                        {member.name || '-'}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      SAC Email
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
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {members.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {member.email ? (
                            <span className="inline-flex items-center gap-2">
                              {member.email}
                              {copiedEmail === member.email ? (
                                <span className="text-gray-500 dark:text-gray-400 text-xs">
                                  Copied!
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleCopyEmail(member.email)}
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
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {member.sacEmail ? (
                            <span className="inline-flex items-center gap-2">
                              {member.sacEmail}
                              {copiedEmail === member.sacEmail ? (
                                <span className="text-gray-500 dark:text-gray-400 text-xs">
                                  Copied!
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleCopyEmail(member.sacEmail)}
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
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
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
                            <span className="inline-flex items-center gap-2">
                              <span className="text-sm text-gray-900 dark:text-white">
                                {formatDate(member.lastPaymentDate)}
                              </span>
                              <PaymentTooltip
                                date={member.lastPaymentDate}
                                amount={member.lastPaymentAmount}
                                notes={member.lastPaymentNotes}
                                source={member.lastPaymentSource}
                              />
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
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
    <Suspense fallback={<SkeletonTable rows={10} columns={7} />}>
      <MembersContent />
    </Suspense>
  )
}
