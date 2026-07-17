'use client'

import PermissionGate from '@/components/admin/PermissionGate'
import HumanReviewNotice from '@/components/admin/ai/HumanReviewNotice'
import AiDesignerTabs, { useAiTab } from '@/components/admin/ai/AiDesignerTabs'
import AiValidationClient from '@/components/admin/ai/AiValidationClient'
import AiGenerationClient from '@/components/admin/ai/AiGenerationClient'
import GuidelinesClient from '@/components/admin/ai/GuidelinesClient'

export default function AiDesignerShell() {
  const activeTab = useAiTab()

  return (
    <PermissionGate permission="read_ai">
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          AI Social Media Designer
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Valida y genera borradores para redes sociales según las guías de SAC. La publicación
          siempre es manual.
        </p>

        <HumanReviewNotice />
        <AiDesignerTabs activeTab={activeTab} />

        {activeTab === 'generar' && <AiGenerationClient />}
        {activeTab === 'guidelines' && <GuidelinesClient />}
        {activeTab === 'validar' && <AiValidationClient />}
      </div>
    </PermissionGate>
  )
}
