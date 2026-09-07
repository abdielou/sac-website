// app/admin/emails/page.js
'use client'

import { Suspense, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import PermissionGate from '@/components/admin/PermissionGate'
import { useEmailAccountability } from '@/lib/hooks/useAdminData'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'
import { filterThreads, sortThreads } from '@/lib/email-table'

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

const FILTERS = ['all', 'overdue', 'pending', 'answered']

const COLUMNS = [
  { key: 'subject', label: 'Asunto' },
  { key: 'sender', label: 'Remitente' },
  { key: 'lastInboundAt', label: 'Recibido' },
  { key: 'daysWaiting', label: 'Días' },
  { key: 'status', label: 'Estado' },
  { key: 'replier', label: 'Respondió' },
  { key: null, label: 'Reply All' },
]

const SENDER_REASON = {
  not_configured: 'falta configurar GMAIL_SENDER_LABEL',
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

function SenderCell({ sender }) {
  if (!sender || !sender.email) return <span>—</span>
  return <span title={sender.email}>{sender.name || sender.email}</span>
}

/**
 * EmailsContent - Table of group email threads and their reply status.
 * Filter by status lives in the URL (?status=), sort lives in local state.
 */
function EmailsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data, isPending, isError, error, refresh, isFetching } = useEmailAccountability()
  const [sort, setSort] = useState({ key: null, direction: 'asc' })

  const result = data?.data
  const allThreads = result?.threads ?? []
  const statusParam = searchParams.get('status')
  const status = FILTERS.includes(statusParam) ? statusParam : 'all'

  const filtered = filterThreads(allThreads, status)
  const threads = sort.key ? sortThreads(filtered, sort.key, sort.direction) : filtered

  const counts = {
    all: allThreads.length,
    overdue: result?.summary?.overdue ?? 0,
    pending: result?.summary?.pending ?? 0,
    answered: result?.summary?.answered ?? 0,
  }

  const setStatus = (next) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') params.delete('status')
    else params.set('status', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Correos del grupo</h2>
          {result && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {/* One string so SSR keeps the sentence in a single text node */}
              {`Últimos ${result.windowDays} días. Sin responder después de ${result.thresholdDays} días. Actualizado ${formatDate(result.generatedAt)}${data?.meta?.fromCache ? ' (caché)' : ''}`}
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

      {/* Status filter */}
      {!isPending && !isError && (
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map((f) => {
            const active = status === f
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(f)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {f === 'all' ? 'Todos' : STATUS_LABEL[f]}
                <span className="ml-1 text-xs opacity-80">{counts[f]}</span>
              </button>
            )
          })}
        </div>
      )}

      {isPending && <SkeletonTable rows={6} columns={7} />}

      {isError && <ErrorState message={error?.message} onRetry={refresh} />}

      {!isPending && !isError && threads.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
          {allThreads.length === 0
            ? `No hay correos en la ventana de ${result?.windowDays ?? 30} días.`
            : 'No hay correos con ese estado.'}
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
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <SenderCell sender={t.sender} />
                  </p>
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
                    {COLUMNS.map((col) => (
                      <th
                        key={col.label}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {col.key ? (
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
                        ) : (
                          col.label
                        )}
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
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                          <SenderCell sender={t.sender} />
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
      <Suspense fallback={<SkeletonTable rows={6} columns={7} />}>
        <EmailsContent />
      </Suspense>
    </PermissionGate>
  )
}
