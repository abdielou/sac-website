import { AdminProviders } from './providers'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'Admin - SAC',
  description: 'Panel de administracion de la Sociedad de Astronomia del Caribe',
}

export default function AdminLayout({ children }) {
  return (
    <LayoutWrapper fullWidth>
      <AdminProviders>
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1 flex flex-col">
            <AdminHeader />
            <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">{children}</main>
          </div>
        </div>
      </AdminProviders>
    </LayoutWrapper>
  )
}
