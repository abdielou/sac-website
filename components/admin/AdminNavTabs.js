'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/admin', label: 'Dashboard', exactMatch: true },
  { href: '/admin/members', label: 'Miembros' },
  { href: '/admin/payments', label: 'Pagos' },
  { href: '/admin/articles', label: 'Articulos' },
]

/**
 * AdminNavTabs - Horizontal navigation tabs for mobile/tablet
 * Shows below lg breakpoint, hidden on desktop where sidebar is used
 */
export function AdminNavTabs() {
  const pathname = usePathname()

  const isActive = (item) => {
    if (item.exactMatch) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <nav className="lg:hidden flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
      {navItems.map((item) => {
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
