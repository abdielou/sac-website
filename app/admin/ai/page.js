import { Suspense } from 'react'
import AiDesignerShell from '@/components/admin/ai/AiDesignerShell'

export const metadata = {
  title: 'AI Designer - SAC',
  description: 'AI Social Media Designer — validación y generación de publicaciones',
}

export default function AdminAIPage() {
  return (
    <Suspense
      fallback={<div className="max-w-6xl text-gray-500 dark:text-gray-400">Cargando...</div>}
    >
      <AiDesignerShell />
    </Suspense>
  )
}
