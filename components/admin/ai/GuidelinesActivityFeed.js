'use client'

import React from 'react'

const ACTION_LABELS = {
  created_draft: 'Edición iniciada',
  saved: 'Cambios guardados',
  activated: 'Cambios activados',
  rollback: 'Versión anterior utilizada de nuevo',
  discarded_draft: 'Cambios descartados',
  created_content_type: 'Tipo de contenido añadido',
  archived_content_type: 'Tipo de contenido archivado',
  removed_content_type: 'Tipo de contenido eliminado',
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

export default function GuidelinesActivityFeed({ events = [], showAutosaves = false }) {
  const visibleEvents = showAutosaves ? events : events.filter((event) => event.action !== 'saved')

  return (
    <section aria-labelledby="guidelines-activity-heading">
      <h3
        id="guidelines-activity-heading"
        className="mb-4 text-sm font-semibold text-gray-900 dark:text-white"
      >
        Actividad
      </h3>
      {visibleEvents.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay actividad importante.</p>
      ) : (
        <ul className="space-y-4">
          {visibleEvents.map((event) => (
            <li
              key={event.id}
              className="border-l-2 border-sac-primary-violet pl-3 dark:border-sac-secondary"
            >
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
    </section>
  )
}
