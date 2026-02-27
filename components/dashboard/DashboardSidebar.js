'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    exactMatch: true,
    feature: 'dashboard',
    roles: ['admin'],
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path
          fillRule="evenodd"
          d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    href: '/admin/members',
    label: 'Miembros',
    feature: 'members',
    roles: ['admin'],
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
      </svg>
    ),
  },
  {
    href: '/admin/payments',
    label: 'Pagos',
    feature: 'payments',
    roles: ['admin'],
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path
          fillRule="evenodd"
          d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm13-1a1 1 0 11-2 0 1 1 0 012 0zM1.75 14.5a.75.75 0 000 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 00-1.5 0v.784a.272.272 0 01-.35.25A49.043 49.043 0 001.75 14.5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    href: '/admin/articles',
    label: 'Articulos',
    feature: 'articles',
    roles: ['admin'],
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path
          fillRule="evenodd"
          d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    href: '/member/profile',
    label: 'Perfil',
    feature: 'profile',
    roles: ['admin', 'member'],
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
]

/**
 * DashboardSidebar - Role-aware desktop sidebar navigation
 * Shows admin tabs for admins, member tabs for members
 * Hidden on mobile/tablet where DashboardNavTabs is used instead
 */
export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  const isAdmin = session?.user?.isAdmin
  const isMember = session?.user?.isMember

  const isActive = (item) => {
    if (item.exactMatch) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  // Filter nav items based on role
  const accessibleItems = navItems.filter((item) => {
    if (isAdmin) {
      // Admin: show admin-only items filtered by accessibleFeatures, plus shared items
      if (item.roles.includes('member') && !item.roles.includes('admin')) {
        // Member-only items are always visible to admins too (admins are also members)
        return true
      }
      if (item.roles.includes('admin')) {
        // Admin items: check accessibleFeatures for admin-specific items
        if (item.feature === 'profile') return true
        if (!session?.user?.accessibleFeatures) return false
        return session.user.accessibleFeatures.includes(item.feature)
      }
      return false
    }
    if (isMember) {
      // Member: show only items with 'member' in roles
      return item.roles.includes('member')
    }
    return false
  })

  const homeHref = isAdmin ? '/admin' : '/member'
  const homeLabel = isAdmin ? 'SAC Admin' : 'SAC'

  return (
    <aside
      className={`hidden lg:flex lg:flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center h-16 border-b border-gray-200 dark:border-gray-700 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-6'
        }`}
      >
        {!collapsed && (
          <Link href={homeHref} className="flex items-center space-x-2">
            <span className="text-lg font-semibold text-gray-900 dark:text-white">{homeLabel}</span>
          </Link>
        )}

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={collapsed ? 'Expandir menu' : 'Colapsar menu'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-5 h-5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className={`py-6 space-y-1 ${collapsed ? 'px-2' : 'px-4'}`}>
        {accessibleItems.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center text-sm font-medium rounded-lg transition-colors ${
                collapsed ? 'justify-center px-2 py-3' : 'px-4 py-3'
              } ${
                active
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span
                className={`flex-shrink-0 ${
                  active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                } ${collapsed ? '' : 'mr-3'}`}
              >
                {item.icon}
              </span>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default DashboardSidebar
