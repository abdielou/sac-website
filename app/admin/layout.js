import { AdminProviders } from './providers'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'

export const metadata = {
  title: 'Admin - SAC',
  description: 'Panel de administracion de la Sociedad de Astronomia del Caribe',
}

export default function AdminLayout({ children }) {
  return (
    <AdminProviders>
      <div className="flex min-h-[calc(100vh-200px)]">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <AdminHeader />
          <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">{children}</main>
        </div>
      </div>
    </AdminProviders>
  )
}
