// components/admin/ContactsCard.js
'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useContacts } from '@/lib/hooks/useAdminData'

/**
 * ContactsCard - Dashboard summary of group emails and their reply status.
 *
 * Shows two counts from /api/admin/contacts: overdue (no reply after the
 * threshold) and pending (no reply yet, inside the threshold).
 * Hidden for users without read_contacts.
 */
export function ContactsCard() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canRead = accessibleActions.includes('read_contacts')
  const { data, isPending, isError, error } = useContacts({ enabled: canRead })

  if (!canRead) return null

  const summary = data?.data?.summary
  const thresholdDays = data?.data?.thresholdDays ?? 7

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Contactos</p>
        <Link
          href="/admin/contacts"
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
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                status: 'overdue',
                label: `Sin responder +${thresholdDays} días`,
                value: summary.overdue,
                color: 'text-red-600 dark:text-red-400',
              },
              {
                status: 'pending',
                label: 'Pendientes',
                value: summary.pending,
                color: 'text-yellow-600 dark:text-yellow-400',
              },
            ].map((tile) => (
              <Link
                key={tile.status}
                href="/admin/contacts"
                className="block rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <span className="block text-xs text-gray-500 dark:text-gray-400">{tile.label}</span>
                <span className={`block text-2xl font-bold ${tile.color}`}>{tile.value}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ContactsCard
