'use client'

import React from 'react'

const SECTIONS = [
  { id: 'types', label: 'Tipos de contenido' },
  { id: 'general', label: 'Reglas generales' },
  { id: 'platforms', label: 'Redes sociales' },
  { id: 'history', label: 'Historial' },
]

export const GUIDELINES_SECTIONS = SECTIONS.map(({ id }) => id)

export default function GuidelinesWorkspaceNav({ activeSection, onChange }) {
  return (
    <nav
      aria-label="Secciones de las guías"
      className="mb-6 sm:border-b sm:border-gray-200 dark:sm:border-gray-700"
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:flex sm:min-w-max sm:gap-6 sm:rounded-none sm:bg-transparent sm:p-0 dark:bg-gray-800 dark:sm:bg-transparent">
        {SECTIONS.map((section) => {
          const active = section.id === activeSection
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onChange?.(section.id)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 sm:rounded-none sm:px-0.5 sm:pb-3 sm:pt-0 dark:focus-visible:ring-offset-gray-900 ${
                active
                  ? 'border-sac-primary-violet bg-white text-sac-primary-violet shadow-sm sm:bg-transparent sm:shadow-none dark:border-sac-secondary dark:bg-gray-700 dark:text-sac-secondary dark:sm:bg-transparent'
                  : 'border-transparent text-gray-500 hover:bg-white hover:text-gray-900 sm:hover:border-gray-300 sm:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white dark:sm:hover:border-gray-600 dark:sm:hover:bg-transparent'
              }`}
            >
              {section.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
