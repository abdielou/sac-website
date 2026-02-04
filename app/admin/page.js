'use client'

import { useStats } from '@/lib/hooks/useStats'
import { useRefreshData } from '@/lib/hooks/useAdminData'
import { StatsCard } from '@/components/admin/StatsCard'
import { SkeletonCard } from '@/components/admin/SkeletonCard'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatNumber, formatCurrency } from '@/lib/formatters'

export default function AdminPage() {
  const { stats, isPending, isError, error } = useStats()
  const { refresh, isRefreshing } = useRefreshData()

  // Loading state - show skeleton cards
  if (isPending) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            Actualizar
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  // Error state - show Spanish message with retry button
  if (isError) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
        </div>
        <ErrorState message={error?.message} onRetry={refresh} />
      </div>
    )
  }

  // Data loaded - show stats cards
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {isRefreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          label="Total Miembros"
          value={formatNumber(stats.total)}
          href="/admin/members"
          color="gray"
        />
        <StatsCard
          label="Miembros Activos"
          value={formatNumber(stats.active)}
          href={{ pathname: '/admin/members', query: { status: 'active' } }}
          color="green"
        />
        <StatsCard
          label="Por Vencer"
          value={formatNumber(stats.expiringSoon)}
          href={{ pathname: '/admin/members', query: { status: 'expiring-soon' } }}
          color="yellow"
        />
        <StatsCard
          label="Pagos del Mes"
          value={formatCurrency(stats.monthlyPayments)}
          href="/admin/payments"
          color="gray"
        />
      </div>
    </div>
  )
}
