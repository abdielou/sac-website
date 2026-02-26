import { auth } from '../../auth'
import { redirect } from 'next/navigation'
import { AdminProviders } from './providers'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminNavTabs } from '@/components/admin/AdminNavTabs'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'Admin - SAC',
  description: 'Panel de administracion de la Sociedad de Astronomia del Caribe',
}

export default async function AdminLayout({ children }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    redirect('/auth/signin')
  }

  return (
    <LayoutWrapper fullWidth>
      <AdminProviders>
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <AdminHeader />
            <AdminNavTabs />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 dark:bg-gray-900">{children}</main>
          </div>
        </div>
      </AdminProviders>
    </LayoutWrapper>
  )
}
