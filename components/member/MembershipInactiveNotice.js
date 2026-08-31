import Link from 'next/link'
import siteMetadata from '@/data/siteMetadata'
import { ACCESS_REASONS } from '@/lib/member-access'
import { signOut } from '../../auth'

/**
 * Pick the copy for a signed-in user who is not entitled to the member portal.
 *
 * @param {string} reason - An ACCESS_REASONS value from resolveMemberAccess()
 * @param {string|null} status - The member's computed status when reason is 'inactive'
 * @returns {{heading: string, body: string|null, showRetry: boolean}}
 */
export function getNoticeCopy(reason, status) {
  if (reason === ACCESS_REASONS.LOOKUP_FAILED) {
    return {
      heading: 'No pudimos verificar tu membresia',
      body: 'Ocurrio un problema al verificar tu membresia. Intenta de nuevo en unos minutos.',
      showRetry: true,
    }
  }

  if (reason === ACCESS_REASONS.NOT_FOUND) {
    return {
      heading: 'No encontramos tu registro de membresia',
      body: null,
      showRetry: false,
    }
  }

  // ACCESS_REASONS.INACTIVE
  if (status === 'expired') {
    return {
      heading: 'Tu membresia no esta activa',
      body: 'Tu membresia esta vencida.',
      showRetry: false,
    }
  }

  if (status === 'applied') {
    return {
      heading: 'Tu membresia no esta activa',
      body: 'Tu solicitud de membresia esta pendiente de aprobacion.',
      showRetry: false,
    }
  }

  // Defensive fallback: only 'expired' and 'applied' can reach an INACTIVE
  // denial (see ACTIVE_MEMBER_STATUSES) and are handled above; this covers
  // any future status value.
  return { heading: 'Tu membresia no esta activa', body: null, showRetry: false }
}

/**
 * Shown in place of the member portal when resolveMemberAccess() denies access.
 * Server component — sign-out uses a server action, so no client JS is needed.
 */
export function MembershipInactiveNotice({ reason, status }) {
  const { heading, body, showRetry } = getNoticeCopy(reason, status)

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 mb-4 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{heading}</h1>
          </div>

          <div className="mb-6 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            {body && (
              <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">{body}</p>
            )}
            <p
              className={`${body ? 'mt-2 ' : ''}text-sm text-yellow-800 dark:text-yellow-200 text-center`}
            >
              Para resolver tu situacion de membresia, escribe a{' '}
              <a href={`mailto:${siteMetadata.email}`} className="font-medium underline">
                {siteMetadata.email}
              </a>
              .
            </p>
          </div>

          <div className="space-y-3">
            {showRetry && (
              // Plain anchor, not <Link>: a full page load re-runs the layout guard.
              <a
                href="/member/profile"
                className="block w-full text-center py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                Reintentar
              </a>
            )}
            <Link
              href="/"
              className="block w-full text-center py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              Ir a la pagina principal
            </Link>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/' })
              }}
            >
              <button
                type="submit"
                className="block w-full text-center py-3 px-4 rounded-lg text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MembershipInactiveNotice
