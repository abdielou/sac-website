'use client'

/**
 * Advisory banner — AI assists, never auto-publishes.
 */
export default function HumanReviewNotice() {
  return (
    <div
      role="note"
      className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <p className="font-medium">Revisión humana obligatoria</p>
      <p className="mt-1 text-amber-800 dark:text-amber-300/90">
        La IA es una herramienta de asesoría. No publica, no programa ni aprueba contenido. Siempre
        revisa los resultados antes de publicar manualmente en redes sociales.
      </p>
    </div>
  )
}
