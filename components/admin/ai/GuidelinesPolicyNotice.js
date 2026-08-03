'use client'

import React from 'react'
import { AI_AGENT_IDENTITY_VERSION } from '@/lib/ai-agent'

export default function GuidelinesPolicyNotice() {
  return (
    <aside className="mb-6 overflow-hidden rounded-xl border border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
      <div className="flex gap-3 px-4 py-4 md:px-5">
        <svg
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 11c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2h-1v2m-1 4h.01M5.07 19A9 9 0 1118.93 19H5.07z"
          />
        </svg>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">El propósito del agente no cambia</h3>
          <p className="mt-1 text-sm leading-6 text-blue-900 dark:text-blue-100">
            Estas guías cambian cómo trabaja, no para qué se usa. El agente solo ayuda a generar y
            validar contenido para las redes sociales del SAC, nunca publica por su cuenta y todo
            resultado requiere revisión humana.
          </p>
        </div>
      </div>
      <details className="border-t border-blue-200 px-4 py-3 text-sm dark:border-blue-800 md:px-5">
        <summary className="cursor-pointer font-medium text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-blue-200">
          Ver límites permanentes
        </summary>
        <div className="mt-3 grid gap-2 text-blue-900 dark:text-blue-100 sm:grid-cols-2">
          <p>Solo trabaja con contenido para las redes sociales del SAC.</p>
          <p>No publica ni ejecuta acciones en redes sociales.</p>
          <p>No puede eliminar la revisión y aprobación humana.</p>
          <p>Estas guías no pueden ampliar ni debilitar esos límites.</p>
        </div>
        <p className="mt-3 text-xs text-blue-700 dark:text-blue-300">
          Identidad del agente: {AI_AGENT_IDENTITY_VERSION}
        </p>
      </details>
    </aside>
  )
}
