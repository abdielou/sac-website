'use client'

import React, { useState } from 'react'
import GuidelinesActivityFeed from '@/components/admin/ai/GuidelinesActivityFeed'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-PR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function GuidelinesVersionHistory({
  versions = [],
  events = [],
  canWrite = false,
  hasDraft = false,
  loading = false,
  onUseVersion,
  onRollbackVersion,
}) {
  const [showAutosaves, setShowAutosaves] = useState(false)
  const draftBlockedTitle = hasDraft
    ? 'Descarta o activa los cambios en curso antes de usar otra versión.'
    : undefined

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <section aria-labelledby="guidelines-versions-heading">
        <div className="mb-4">
          <h3
            id="guidelines-versions-heading"
            className="text-base font-semibold text-gray-950 dark:text-white"
          >
            Versiones
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Puedes volver a usar una versión anterior o comenzar cambios nuevos a partir de ella.
          </p>
        </div>

        {versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Aún no hay versiones activadas.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {versions.map((entry) => {
              const isActive = entry.status === 'active'
              return (
                <li
                  key={`${entry.version}-${entry.activatedAt || 'na'}`}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                        {entry.versionName || entry.version}
                      </p>
                      {isActive && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                          En uso
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {entry.versionName ? `${entry.version} · ` : ''}
                      {entry.activatedBy ? `${entry.activatedBy} · ` : ''}
                      {formatDate(entry.activatedAt)}
                    </p>
                  </div>
                  {canWrite && !isActive && (
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      <button
                        type="button"
                        disabled={loading || hasDraft}
                        onClick={() => onRollbackVersion?.(entry.version)}
                        title={draftBlockedTitle}
                        className="rounded-lg bg-sac-primary-violet px-3 py-2 text-sm font-semibold text-white hover:bg-sac-primary-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
                      >
                        Usar esta versión
                      </button>
                      <button
                        type="button"
                        disabled={loading || hasDraft}
                        onClick={() => onUseVersion?.(entry.version)}
                        title={draftBlockedTitle}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:border-sac-primary-violet hover:text-sac-primary-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:border-sac-secondary dark:hover:text-sac-secondary"
                      >
                        Usar como base para nuevos cambios
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div>
        <GuidelinesActivityFeed events={events} showAutosaves={showAutosaves} />
        {events.some((event) => event.action === 'saved') && (
          <label className="mt-5 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={showAutosaves}
              onChange={(event) => setShowAutosaves(event.target.checked)}
              className="rounded border-gray-300 text-sac-primary-violet focus:ring-sac-primary-violet dark:border-gray-600"
            />
            Mostrar guardados automáticos
          </label>
        )}
      </div>
    </div>
  )
}
