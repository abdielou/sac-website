// components/admin/EmailsCard.js
'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useEmailAccountability } from '@/lib/hooks/useAdminData'

/**
 * EmailsCard - Dashboard summary of group emails and their reply status.
 *
 * Shows three counts from /api/admin/emails: overdue (no reply after the
 * threshold), pending (no reply yet, inside the threshold), answered.
 * Hidden for users without read_emails.
 */
export function EmailsCard() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canRead = accessibleActions.includes('read_emails')
  const { data, isPending, isError, error } = useEmailAccountability({ enabled: canRead })

  if (!canRead) return null

  const summary = data?.data?.summary
  const thresholdDays = data?.data?.thresholdDays ?? 7

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Correos del grupo</p>
        <Link
          href="/admin/emails"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Ver detalle
        </Link>
      </div>

      <div className="mt-2 min-h-[3.5rem]">
        {isPending && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}

        {isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error?.message || 'Error al cargar los correos'}
          </p>
        )}

        {summary && (
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                {`Sin responder +${thresholdDays} días`}
              </dt>
              <dd className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summary.overdue}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Pendientes</dt>
              <dd className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {summary.pending}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Respondidos</dt>
              <dd className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary.answered}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  )
}

export default EmailsCard
