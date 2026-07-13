'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export const AI_TABS = [
  { id: 'validar', label: 'Validar' },
  { id: 'generar', label: 'Generar' },
  { id: 'guidelines', label: 'Guidelines' },
]

export const DEFAULT_AI_TAB = 'validar'

export function resolveAiTab(tabParam) {
  const id = String(tabParam || DEFAULT_AI_TAB)
  return AI_TABS.some((t) => t.id === id) ? id : DEFAULT_AI_TAB
}

/** Build /admin/ai href for a tab. Clears runId when leaving Validar. */
export function buildAiTabHref(tabId, { runId } = {}) {
  const params = new URLSearchParams()
  if (tabId && tabId !== DEFAULT_AI_TAB) {
    params.set('tab', tabId)
  }
  if (tabId === 'validar' && runId) {
    params.set('runId', runId)
  }
  const qs = params.toString()
  return qs ? `/admin/ai?${qs}` : '/admin/ai'
}

export default function AiDesignerTabs({ activeTab }) {
  return (
    <nav
      className="mb-6 flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto"
      aria-label="AI Designer"
    >
      {AI_TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <Link
            key={tab.id}
            href={buildAiTabHref(tab.id)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
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
