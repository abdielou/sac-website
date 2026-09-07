// app/admin/emails/page.js
'use client'

import PermissionGate from '@/components/admin/PermissionGate'
import { useEmailAccountability } from '@/lib/hooks/useAdminData'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'

const STATUS_LABEL = {
  overdue: 'Sin responder',
  pending: 'Pendiente',
  answered: 'Respondido',
}

const STATUS_CLASS = {
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  answered: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function lastReply(thread) {
  return thread.replies.length ? thread.replies[thread.replies.length - 1] : null
}

/**
 * EmailsContent - Table of group email threads and their reply status.
 */
function EmailsContent() {
  const { data, isPending, isError, error, refresh, isFetching } = useEmailAccountability()
  const result = data?.data
  const threads = result?.threads ?? []

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Correos del grupo</h2>
          {result && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {/* One string so SSR keeps the sentence in a single text node */}
              {`Últimos ${result.windowDays} días. Sin responder después de ${result.thresholdDays} días. Actualizado ${formatDate(result.generatedAt)}${data?.meta?.fromCache ? ' (caché)' : ''}`}
            </p>
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

      {isPending && <SkeletonTable rows={6} columns={6} />}

      {isError && <ErrorState message={error?.message} onRetry={refresh} />}

      {!isPending && !isError && threads.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
          No hay correos en la ventana de {result?.windowDays ?? 30} días.
        </div>
      )}

      {!isPending && !isError && threads.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {threads.map((t) => {
              const reply = lastReply(t)
              return (
                <div
                  key={t.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900 dark:text-white">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Recibido {formatDate(t.lastInboundAt)} · {t.daysWaiting} días
                  </p>
                  {reply && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Respondió {reply.by} · Reply All: {reply.replyAll ? 'Sí' : 'No'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {['Asunto', 'Recibido', 'Días', 'Estado', 'Respondió', 'Reply All'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {threads.map((t) => {
                    const reply = lastReply(t)
                    return (
                      <tr key={t.id}>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                          {t.subject}
                          {t.inboundCount > 1 && (
                            <span className="ml-2 text-xs text-gray-400">×{t.inboundCount}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(t.lastInboundAt)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {t.daysWaiting}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {reply ? reply.by : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {reply ? (reply.replyAll ? 'Sí' : 'No') : '—'}
                        </td>
                      </tr>
                    )
                  })}
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
      <EmailsContent />
    </PermissionGate>
  )
}
