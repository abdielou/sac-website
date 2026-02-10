'use client'

import { useRefreshData } from '@/lib/hooks/useAdminData'

/**
 * Refresh button that clears server cache and refetches all admin data
 * Client component — can be embedded in server components like AdminHeader
 */
export function RefreshButton() {
  const { refresh, isRefreshing } = useRefreshData()

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={isRefreshing}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 transition-colors"
      title="Actualizar datos"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
      >
        <path
          fillRule="evenodd"
          d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-10.624-2.85a5.5 5.5 0 019.201-2.465l.312.31H11.77a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.535a.75.75 0 00-1.5 0v2.033l-.312-.311A7 7 0 002.63 8.389a.75.75 0 001.45.388z"
          clipRule="evenodd"
        />
      </svg>
      <span className="hidden md:inline">{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
    </button>
  )
}

export default RefreshButton
