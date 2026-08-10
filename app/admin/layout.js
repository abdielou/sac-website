import { auth } from '../../auth'
import { redirect } from 'next/navigation'
import { AdminProviders } from './providers'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { DashboardNavTabs } from '@/components/dashboard/DashboardNavTabs'
import LayoutWrapper from '@/components/LayoutWrapper'
import { buildAiClientStorageUserKey } from '@/lib/ai-run-client-identity'

export const metadata = {
  title: 'Admin - SAC',
  description: 'Panel de administracion de la Sociedad de Astronomia del Caribe',
}

export default async function AdminLayout({ children }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    redirect('/auth/signin')
  }
  const aiStorageUserKey = buildAiClientStorageUserKey(session.user)

  return (
    <LayoutWrapper fullWidth>
      <AdminProviders aiUserKey={aiStorageUserKey}>
        <div className="flex">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <DashboardHeader />
            <DashboardNavTabs />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 dark:bg-gray-900">{children}</main>
          </div>
        </div>
      </AdminProviders>
    </LayoutWrapper>
  )
}
