'use client'

const ACTION_LABELS = {
  created_draft: 'Borrador creado',
  saved: 'Borrador guardado',
  activated: 'Versión activada',
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('es-PR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function GuidelinesActivityFeed({ events }) {
  return (
    <aside className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Actividad reciente
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin actividad registrada aún.</p>
      ) : (
        <ul className="space-y-4">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-blue-500 pl-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {ACTION_LABELS[event.action] || event.action}
                {event.version ? ` — ${event.version}` : ''}
              </p>
              {event.detail && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{event.detail}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {formatDate(event.at)}
                {event.by ? ` · ${event.by}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
