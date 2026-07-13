'use client'

import { useSession } from 'next-auth/react'

export default function GeneratePlaceholder() {
  const { data: session } = useSession()
  const canGenerate = session?.user?.accessibleActions?.includes('write_ai')

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Generar borrador
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        El agente generador estará disponible próximamente. Permitirá crear borradores de texto
        (y eventualmente imágenes) para redes sociales según las guías de SAC.
      </p>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Funcionalidades planificadas
        </p>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>Intención y tema del contenido</li>
          <li>Selección de plataforma(s): X, Instagram, Facebook</li>
          <li>Tipo de contenido y tono</li>
          <li>Estilo y restricciones de imagen</li>
          <li>Borrador en español con supuestos y pasos sugeridos</li>
        </ul>
      </div>

      {!canGenerate && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Se requiere permiso <code className="text-xs">write_ai</code> para iniciar generaciones
          cuando esté disponible.
        </p>
      )}
    </div>
  )
}
