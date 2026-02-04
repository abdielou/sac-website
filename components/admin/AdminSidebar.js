'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    exactMatch: true,
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
]

export function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const isActive = (item) => {
    if (item.exactMatch) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  const onToggleNav = () => {
    setIsOpen((status) => {
      if (status) {
        document.body.style.overflow = 'auto'
      } else {
        document.body.style.overflow = 'hidden'
      }
      return !status
    })
  }

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false)
      document.body.style.overflow = 'auto'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [])

  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm"
        aria-label="Toggle sidebar"
        onClick={onToggleNav}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-6 h-6 text-gray-700 dark:text-gray-200"
        >
          {isOpen ? (
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          ) : (
            <path
              fillRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onToggleNav}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transform transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:h-auto ${collapsed ? 'w-16' : 'w-64'}`}
      >
        {/* Header */}
        <div
          className={`flex items-center h-16 border-b border-gray-200 dark:border-gray-700 ${
            collapsed ? 'justify-center px-2' : 'justify-between px-6'
          }`}
        >
          {!collapsed && (
            <Link href="/admin" className="flex items-center space-x-2">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                SAC Admin
              </span>
            </Link>
          )}

          {/* Collapse toggle (desktop only) */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
          {navItems.map((item) => {
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
    </>
  )
}

export default AdminSidebar
