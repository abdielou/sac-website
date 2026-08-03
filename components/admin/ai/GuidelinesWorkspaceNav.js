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
      className="mb-6 overflow-x-auto border-b border-gray-200 dark:border-gray-700"
    >
      <div className="flex min-w-max gap-6">
        {SECTIONS.map((section) => {
          const active = section.id === activeSection
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onChange?.(section.id)}
              aria-current={active ? 'page' : undefined}
              className={`border-b-2 px-0.5 pb-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
                active
                  ? 'border-sac-primary-violet text-sac-primary-violet dark:border-sac-secondary dark:text-sac-secondary'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-white'
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
