import { auth } from '../../auth'
import { redirect } from 'next/navigation'
import { MemberProviders } from './providers'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { DashboardNavTabs } from '@/components/dashboard/DashboardNavTabs'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'Mi Cuenta - SAC',
  description: 'Portal de miembro de la Sociedad de Astronomia del Caribe',
}

export default async function MemberLayout({ children }) {
  const session = await auth()
  if (!session) {
    redirect('/auth/signin')
  }

  return (
    <LayoutWrapper fullWidth>
      <MemberProviders>
        <div className="flex">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <DashboardHeader />
            <DashboardNavTabs />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 dark:bg-gray-900">{children}</main>
          </div>
        </div>
      </MemberProviders>
    </LayoutWrapper>
  )
}
