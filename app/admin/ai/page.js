import { auth } from '../../../auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'AI - SAC',
  description: 'AI Social Media Designer',
}

export default async function AdminAIPage() {
  const session = await auth()

  // Feature gate: require read_ai/write_ai (surfaced as the 'ai' accessible feature).
  if (!session?.user?.accessibleFeatures?.includes('ai')) {
    redirect('/admin')
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        AI Social Media Designer
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Próximamente. Esta es la base de la nueva pestaña de IA para generar y validar publicaciones
        de redes sociales.
      </p>
      <div
        data-testid="ai-tab-placeholder"
        className="mt-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400"
      >
        Punto de partida para la funcionalidad de IA.
      </div>
    </div>
  )
}
