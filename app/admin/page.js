'use client'

import { useStats } from '@/lib/hooks/useStats'
import { StatsCard } from '@/components/admin/StatsCard'
import { SkeletonCard } from '@/components/admin/SkeletonCard'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatNumber } from '@/lib/formatters'

export default function AdminPage() {
  const { stats, isPending, isError, error } = useStats()

  // Loading state - show skeleton cards
  if (isPending) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard</h2>
        <ErrorState message={error?.message} />
      </div>
    )
  }

  // Data loaded - show stats cards
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      </div>
    </div>
  )
}
