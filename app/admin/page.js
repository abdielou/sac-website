import { auth, signOut } from '../../auth'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Panel de Administracion
          </h1>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <p className="text-green-700 dark:text-green-300">
              Autenticacion exitosa
            </p>
          </div>

          <div className="space-y-2 text-gray-700 dark:text-gray-300 mb-6">
            <p><strong>Usuario:</strong> {session.user?.name}</p>
            <p><strong>Email:</strong> {session.user?.email}</p>
          </div>

          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Cerrar sesion
            </button>
          </form>

          <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
            El dashboard completo se construira en las siguientes fases.
          </p>
        </div>
      </div>
    </div>
  )
}
