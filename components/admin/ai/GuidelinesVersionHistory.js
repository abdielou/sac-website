'use client'

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
  canWrite = false,
  loading = false,
  onRollback,
}) {
  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Historial de versiones
      </h3>
      {versions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin versiones publicadas aún.</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {versions.map((entry) => {
            const isActive = entry.status === 'active'
            return (
              <li
                key={`${entry.version}-${entry.activatedAt || 'na'}`}
                className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {entry.version}
                    {isActive && (
                      <span className="ml-2 text-xs font-normal text-green-700 dark:text-green-400">
                        Activa
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(entry.activatedAt)}
                    {entry.activatedBy ? ` · ${entry.activatedBy}` : ''}
                  </p>
                </div>
                {canWrite && !isActive && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onRollback?.(entry.version)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
