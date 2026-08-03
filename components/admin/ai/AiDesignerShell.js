'use client'

import React from 'react'
import PermissionGate from '@/components/admin/PermissionGate'
import HumanReviewNotice from '@/components/admin/ai/HumanReviewNotice'
import AiDesignerTabs, { useAiTab } from '@/components/admin/ai/AiDesignerTabs'
import AiValidationClient from '@/components/admin/ai/AiValidationClient'
import AiGenerationClient from '@/components/admin/ai/AiGenerationClient'
import GuidelinesClient from '@/components/admin/ai/GuidelinesClient'

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

        {activeTab === 'generar' && <AiGenerationClient />}
        {activeTab === 'guidelines' && <GuidelinesClient />}
        {activeTab === 'validar' && <AiValidationClient />}
      </div>
    </PermissionGate>
  )
}
