'use client'

import React from 'react'
import Link from 'next/link'
import PermissionGate from '@/components/admin/PermissionGate'
import HumanReviewNotice from '@/components/admin/ai/HumanReviewNotice'
import AiDesignerTabs, { useAiTab } from '@/components/admin/ai/AiDesignerTabs'
import AiValidationClient from '@/components/admin/ai/AiValidationClient'
import AiGenerationClient from '@/components/admin/ai/AiGenerationClient'
import GuidelinesClient from '@/components/admin/ai/GuidelinesClient'
import {
  AI_RUN_MODES,
  buildAiRunHref,
  useOptionalAiRunCoordinator,
} from '@/lib/hooks/AiRunProvider'

export function AiRunStatusNotice({ activeTab }) {
  const coordinator = useOptionalAiRunCoordinator()
  const slot = coordinator?.slot
  if (!slot?.hydrated || !slot.mode) return null

  const ownerTab = slot.mode === AI_RUN_MODES.GENERATE ? 'generar' : 'validar'
  const ownerLabel = slot.mode === AI_RUN_MODES.GENERATE ? 'generación' : 'validación'
  const differentTab = activeTab !== ownerTab

  return (
    <>
      {slot.coordination === 'local' &&
        (slot.status === 'starting' || slot.status === 'pending' || slot.status === 'running') && (
          <div
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
            data-testid="ai-local-coordination-warning"
          >
            La coordinación AI está operando localmente. Evita iniciar otra ejecución desde otra
            pestaña o dispositivo hasta que esta termine.
          </div>
        )}

      {differentTab && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100"
          role="status"
          data-testid="ai-run-resume-notice"
        >
          <span>
            {slot.status === 'completed'
              ? `Tienes una ${ownerLabel} terminada.`
              : slot.status === 'failed' || slot.status === 'cancelled'
                ? `La última ${ownerLabel} terminó con un error.`
                : `Hay una ${ownerLabel} en curso.`}
          </span>
          <Link href={buildAiRunHref(slot)} className="font-medium underline underline-offset-2">
            Ver {ownerLabel}
          </Link>
        </div>
      )}
    </>
  )
}

export default function AiDesignerShell() {
  const activeTab = useAiTab()
  const isGuidelines = activeTab === 'guidelines'

  return (
    <PermissionGate permission="read_ai">
      <div className={isGuidelines ? 'w-full max-w-[1600px]' : 'max-w-6xl'}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Asistente de redes sociales
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Genera y valida contenido para las redes sociales del SAC.
        </p>

        {!isGuidelines && <HumanReviewNotice />}
        <AiDesignerTabs activeTab={activeTab} />
        <AiRunStatusNotice activeTab={activeTab} />

        {activeTab === 'generar' && <AiGenerationClient />}
        {activeTab === 'guidelines' && <GuidelinesClient />}
        {activeTab === 'validar' && <AiValidationClient />}
      </div>
    </PermissionGate>
  )
}
