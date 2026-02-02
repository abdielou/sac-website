import Link from 'next/link'

/**
 * Get Spanish error message based on error type
 * @param {string|undefined} error - Error type from Auth.js
 * @returns {string} Spanish error message
 */
function getErrorMessage(error) {
  switch (error) {
    case 'AccessDenied':
      return 'No tienes permiso para acceder. Tu cuenta no esta autorizada.'
    case 'Configuration':
      return 'Error de configuracion del servidor. Contacta al administrador.'
    case 'Verification':
      return 'Error de verificacion. Por favor intenta de nuevo.'
    default:
      return 'Ocurrio un error durante la autenticacion.'
  }
}

export default async function AuthErrorPage({ searchParams }) {
  const params = await searchParams
  const error = params?.error

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Error de Autenticacion
            </h1>
          </div>

          {/* Error message */}
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300 text-center">
              {getErrorMessage(error)}
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <Link
              href="/auth/signin"
              className="block w-full text-center py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              Volver a intentar
            </Link>
            <Link
              href="/"
              className="block w-full text-center py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              Ir a la pagina principal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
