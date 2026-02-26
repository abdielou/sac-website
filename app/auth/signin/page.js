import { redirect } from 'next/navigation'
import { signIn, auth } from '../../../auth'

/**
 * Google "G" logo SVG component
 */
function GoogleLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export default async function SignInPage({ searchParams }) {
  const params = await searchParams
  const callbackUrl = params?.callbackUrl ?? '/admin'
  const error = params?.error

  // Check if user is already signed in
  const session = await auth()
  if (session) {
    redirect(callbackUrl)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Acceso SAC</h1>
            <p className="text-gray-600 dark:text-gray-400">Sociedad de Astronomia del Caribe</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-300">
                {error === 'AccessDenied'
                  ? 'Tu cuenta no esta asociada a la Sociedad de Astronomia del Caribe. Si eres miembro, usa tu cuenta @sociedadastronomia.com.'
                  : 'Error al iniciar sesion. Por favor intenta de nuevo.'}
              </p>
            </div>
          )}

          {/* Sign in form with Server Action */}
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: callbackUrl })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-3 px-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              <GoogleLogo />
              Iniciar sesion con Google
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-xs text-center text-gray-500 dark:text-gray-400">
            Acceso exclusivo para miembros y administradores de la Sociedad de Astronomia del
            Caribe.
          </p>
        </div>
      </div>
    </div>
  )
}
