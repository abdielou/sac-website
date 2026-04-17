'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useStats } from '@/lib/hooks/useStats'
import { StatsCard } from '@/components/admin/StatsCard'
import { ScanCard } from '@/components/admin/ScanCard'
import { WhatsAppAuditCard } from '@/components/admin/WhatsAppAuditCard'
import { SkeletonCard } from '@/components/admin/SkeletonCard'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatNumber } from '@/lib/formatters'

const FEATURE_ROUTES = {
  members: '/admin/members',
  payments: '/admin/payments',
  articles: '/admin/articles',
  guides: '/admin/guides',
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const perms = session?.user?.accessibleActions || []
  const canReadMembers = perms.includes('read_members')
  const { stats, isPending, isError, error } = useStats()

  // Redirect users without dashboard access to their first accessible feature
  useEffect(() => {
    if (status !== 'authenticated') return
    if (canReadMembers) return // Dashboard is available

    const features = session?.user?.accessibleFeatures || []
    for (const f of Object.keys(FEATURE_ROUTES)) {
      if (features.includes(f)) {
        router.replace(FEATURE_ROUTES[f])
        return
      }
    }
  }, [status, canReadMembers, session, router])

  // Loading state - show skeleton cards
  if (isPending) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Actions skeleton */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

      {canReadMembers && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
            label="Expirados"
            value={formatNumber(stats.expired)}
            href={{ pathname: '/admin/members', query: { status: 'expired' } }}
            color="red"
          />
          <StatsCard
            label="Aplicados"
            value={formatNumber(stats.applied)}
            href={{ pathname: '/admin/members', query: { status: 'applied' } }}
            color="purple"
          />
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ScanCard />
        <WhatsAppAuditCard />
      </div>
    </div>
  )
}
