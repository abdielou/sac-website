'use client'

import GuideEditor from '@/components/admin/GuideEditor'

/**
 * NewGuidePage - Create a new observing guide
 */
export default function NewGuidePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Nueva Guia de Observacion
      </h1>
      <GuideEditor />
    </div>
  )
}
