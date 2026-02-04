import { auth } from '../../auth'
import { redirect } from 'next/navigation'
import { SkeletonCard } from '@/components/admin/SkeletonCard'

export default async function AdminPage() {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h2>

      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Bienvenido, {session.user?.name || session.user?.email}. Las estadisticas se mostraran
        aqui en la siguiente fase.
      </p>

      {/* Placeholder for future stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <SkeletonCard className="shadow-none p-0 bg-transparent" />
          <p className="mt-2 text-xs text-gray-400">Total Miembros</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <SkeletonCard className="shadow-none p-0 bg-transparent" />
          <p className="mt-2 text-xs text-gray-400">Miembros Activos</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <SkeletonCard className="shadow-none p-0 bg-transparent" />
          <p className="mt-2 text-xs text-gray-400">Por Vencer</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <SkeletonCard className="shadow-none p-0 bg-transparent" />
          <p className="mt-2 text-xs text-gray-400">Pagos del Mes</p>
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
        Fase 4 agregara las estadisticas reales desde Google Sheets.
      </p>
    </div>
  )
}
