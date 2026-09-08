// app/admin/emails/page.js
'use client'

import { Suspense, useState } from 'react'
import PermissionGate from '@/components/admin/PermissionGate'
import { useEmailAccountability } from '@/lib/hooks/useAdminData'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'
import { sortThreads } from '@/lib/email-table'

const COLUMNS = [
  { key: 'subject', label: 'Asunto' },
  { key: 'sender', label: 'Remitente' },
  { key: 'lastInboundAt', label: 'Recibido' },
  { key: 'daysWaiting', label: 'Días' },
]

const SENDER_REASON = {
  not_configured: 'falta configurar GMAIL_SENDER_LABEL',
}

/**
 * Background for the days cell, relative to the overdue threshold:
 * under half the threshold green, up to the threshold yellow, up to twice
 * the threshold orange, beyond that red.
 */
function daysClass(days, thresholdDays) {
  if (days < thresholdDays / 2)
    return 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200'
  if (days < thresholdDays)
    return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200'
  if (days < thresholdDays * 2)
    return 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200'
  return 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200'
}

function SenderCell({ sender }) {
  if (!sender || !sender.email) return <span>—</span>
  return <span title={sender.email}>{sender.name || sender.email}</span>
}

/**
 * EmailsContent - Group emails that nobody has answered yet.
 * Answered threads never appear here. Sort lives in local state.
 */
function EmailsContent() {
  const { data, isPending, isError, error, refresh, isFetching } = useEmailAccountability()
  const [sort, setSort] = useState({ key: null, direction: 'asc' })

  const result = data?.data
  const thresholdDays = result?.thresholdDays ?? 7
  const unanswered = (result?.threads ?? []).filter((t) => t.status !== 'answered')
  const threads = sort.key ? sortThreads(unanswered, sort.key, sort.direction) : unanswered

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    )
  }

  const senderStatus = result?.senderStatus
  const senderNotice =
    senderStatus && !senderStatus.ok
      ? `Remitentes no disponibles: ${SENDER_REASON[senderStatus.reason] ?? senderStatus.reason}`
      : null

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Correos sin responder
          </h2>
          {result && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {/* One string so SSR keeps the sentence in a single text node */}
              {`${unanswered.length} sin responder en los últimos ${result.windowDays} días. Actualizado ${formatDate(result.generatedAt)}${data?.meta?.fromCache ? ' (caché)' : ''}${result.heldCount ? `. ${result.heldCount} retenidos por el grupo, no mostrados` : ''}`}
            </p>
          )}
          {senderNotice && (
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">{senderNotice}</p>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isFetching}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
        >
          {isFetching ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {isPending && <SkeletonTable rows={6} columns={4} />}

      {isError && <ErrorState message={error?.message} onRetry={refresh} />}

      {!isPending && !isError && threads.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
          {`Todo respondido. No hay correos pendientes en los últimos ${result?.windowDays ?? 30} días.`}
        </div>
      )}

      {!isPending && !isError && threads.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {threads.map((t) => (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
                <p className="font-medium text-gray-900 dark:text-white">{t.subject}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <SenderCell sender={t.sender} />
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Recibido {formatDate(t.lastInboundAt)} ·{' '}
                  <span
                    className={`inline-block px-2 rounded ${daysClass(t.daysWaiting, thresholdDays)}`}
                  >
                    {t.daysWaiting} días
                  </span>
                </p>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1 uppercase hover:text-gray-900 dark:hover:text-white"
                        >
                          {col.label}
                          {sort.key === col.key && (
                            <span aria-hidden="true">{sort.direction === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {threads.map((t) => (
                    <tr key={t.id}>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {t.subject}
                        {t.inboundCount > 1 && (
                          <span className="ml-2 text-xs text-gray-400">×{t.inboundCount}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <SenderCell sender={t.sender} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(t.lastInboundAt)}
                      </td>
                      <td
                        data-days={t.daysWaiting}
                        className={`px-6 py-4 text-sm font-medium text-center ${daysClass(t.daysWaiting, thresholdDays)}`}
                      >
                        {t.daysWaiting}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function EmailsPage() {
  return (
    <PermissionGate permission="read_emails">
      <Suspense fallback={<SkeletonTable rows={6} columns={4} />}>
        <EmailsContent />
      </Suspense>
    </PermissionGate>
  )
}
