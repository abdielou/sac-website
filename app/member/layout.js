import { auth } from '../../auth'
import { redirect } from 'next/navigation'
import { MemberProviders } from './providers'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { DashboardNavTabs } from '@/components/dashboard/DashboardNavTabs'
import LayoutWrapper from '@/components/LayoutWrapper'
import { MembershipInactiveNotice } from '@/components/member/MembershipInactiveNotice'
import { resolveMemberAccess } from '@/lib/member-access'

export const metadata = {
  title: 'Mi Cuenta - SAC',
  description: 'Portal de miembro de la Sociedad de Astronomia del Caribe',
}

export default async function MemberLayout({ children }) {
  const session = await auth()
  if (!session) {
    redirect('/auth/signin?callbackUrl=/member/profile')
  }

  // Re-resolved on every load (against the 5-minute members cache) so a renewal
  // or a lapse takes effect without requiring the member to sign out and back in.
  const access = await resolveMemberAccess(session)
  if (!access.allowed) {
    // Render the notice INSTEAD of redirecting: a notice page under /member
    // would re-enter this layout and loop. Sidebar, header, and nav tabs are
    // omitted because every link they expose is gated.
    return (
      <LayoutWrapper>
        <MembershipInactiveNotice reason={access.reason} status={access.status} />
      </LayoutWrapper>
    )
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
