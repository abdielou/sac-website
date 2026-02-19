'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

const navItems = [
  { href: '/admin', label: 'Dashboard', exactMatch: true, feature: 'dashboard' },
  { href: '/admin/members', label: 'Miembros', feature: 'members' },
  { href: '/admin/payments', label: 'Pagos', feature: 'payments' },
  { href: '/admin/articles', label: 'Articulos', feature: 'articles' },
]

/**
 * AdminNavTabs - Horizontal navigation tabs for mobile/tablet
 * Shows below lg breakpoint, hidden on desktop where sidebar is used
 */
export function AdminNavTabs() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const isActive = (item) => {
    if (item.exactMatch) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  // Filter nav items based on user permissions from session
  const accessibleItems = navItems.filter((item) => {
    if (!session?.user?.accessibleFeatures) {
      return false
    }
    return session.user.accessibleFeatures.includes(item.feature)
  })

  return (
    <nav className="lg:hidden flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
      {accessibleItems.map((item) => {
        const active = isActive(item)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default AdminNavTabs
