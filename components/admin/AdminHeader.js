import { auth, signOut } from '../../auth'
import { RefreshButton } from './RefreshButton'

/**
 * AdminHeader - Server component displaying user info and logout button
 * Shows current user email, refresh button, and provides session termination
 */
export async function AdminHeader() {
  const session = await auth()

  return (
    <header className="flex items-center justify-between gap-2 py-3 px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <h1 className="text-base font-semibold text-gray-900 dark:text-white">Admin</h1>
      <div className="flex items-center gap-2 md:gap-4">
        <RefreshButton />
        <span className="hidden md:inline text-sm text-gray-600 dark:text-gray-400">
          {session?.user?.email}
        </span>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/' })
          }}
        >
          <button
            type="submit"
            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
          >
            Salir
          </button>
        </form>
      </div>
    </header>
  )
}

export default AdminHeader
