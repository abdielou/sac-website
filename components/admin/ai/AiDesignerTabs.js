'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AI_RUN_MODES, useOptionalAiRunCoordinator } from '@/lib/hooks/AiRunProvider'

export const AI_TABS = [
  { id: 'validar', label: 'Validar' },
  { id: 'generar', label: 'Generar' },
  { id: 'guidelines', label: 'Guías' },
]

export const DEFAULT_AI_TAB = 'validar'

export function resolveAiTab(tabParam) {
  const id = String(tabParam || DEFAULT_AI_TAB)
  return AI_TABS.some((t) => t.id === id) ? id : DEFAULT_AI_TAB
}

function modeForTab(tabId) {
  if (tabId === 'generar') return AI_RUN_MODES.GENERATE
  if (tabId === 'validar') return AI_RUN_MODES.VALIDATE
  return null
}

/** Build a tab href, carrying a run only into the tab that owns it. */
export function buildAiTabHref(tabId, { runId, runMode = AI_RUN_MODES.VALIDATE } = {}) {
  const params = new URLSearchParams()
  if (tabId && tabId !== DEFAULT_AI_TAB) {
    params.set('tab', tabId)
  }
  if (runId && modeForTab(tabId) === runMode) {
    params.set('runId', runId)
  }
  const qs = params.toString()
  return qs ? `/admin/ai?${qs}` : '/admin/ai'
}

export default function AiDesignerTabs({ activeTab }) {
  const coordinator = useOptionalAiRunCoordinator()
  const activeRun = coordinator?.slot

  return (
    <nav
      className="mb-6 flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto"
      aria-label="Asistente de redes sociales"
    >
      {AI_TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <Link
            key={tab.id}
            href={buildAiTabHref(tab.id, {
              runId: activeRun?.runId,
              runMode: activeRun?.mode,
            })}
            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-sac-primary-violet text-sac-primary-violet dark:border-sac-secondary dark:text-sac-secondary'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Hook helper for pages that need the active tab from the URL. */
export function useAiTab() {
  const searchParams = useSearchParams()
  return resolveAiTab(searchParams.get('tab'))
}
