'use client'

import { useMemo, useState } from 'react'
import {
  listContentTypeEntries,
  listPlatformEntries,
  previewGuidelinesAgainstDocument,
  resolveContentTypeOptions,
  resolvePlatformOptions,
} from '@/lib/ai-guidelines-draft'

const selectClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100'

/**
 * Lightweight client-side preview of which guideline sections apply to a sample post.
 */
export default function GuidelinesPreview({ doc }) {
  const platformOptions = useMemo(() => resolvePlatformOptions(doc), [doc])
  const contentTypeOptions = useMemo(() => resolveContentTypeOptions(doc), [doc])

  const [platform, setPlatform] = useState(platformOptions[0]?.id || 'instagram')
  const [contentType, setContentType] = useState(contentTypeOptions[0]?.id || 'regular_post')
  const [mode, setMode] = useState('validation')
  const [sampleText, setSampleText] = useState(
    'Únete a nuestra noche de observación este sábado en el Observatorio. ¡Trae binoculares!'
  )

  const preview = useMemo(
    () => previewGuidelinesAgainstDocument(doc, { platform, contentType, mode }),
    [doc, platform, contentType, mode]
  )

  const platformLabel = listPlatformEntries(doc).find((p) => p.id === platform)?.label || platform
  const contentTypeLabel =
    listContentTypeEntries(doc).find((c) => c.id === contentType)?.label || contentType

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
        Vista previa con publicación de muestra
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Revisa qué reglas aplicarían a una publicación de ejemplo antes de activar el borrador. No
        ejecuta el agente de IA.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Modo
          </label>
          <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="validation">Validación</option>
            <option value="generation">Generación</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Plataforma
          </label>
          <select
            className={selectClass}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {platformOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Tipo de contenido
          </label>
          <select
            className={selectClass}
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
          >
            {contentTypeOptions.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Texto de muestra
      </label>
      <textarea
        className={`${selectClass} min-h-[80px] mb-4`}
        value={sampleText}
        onChange={(e) => setSampleText(e.target.value)}
      />

      <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-3 mb-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Muestra · {platformLabel} · {contentTypeLabel} · {preview.version}
        </p>
        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{sampleText}</p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Global</dt>
          <dd className="mt-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {preview.global}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Plataforma</dt>
          <dd className="mt-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {preview.platform}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Tipo de contenido
          </dt>
          <dd className="mt-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {preview.contentType}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Prohibido</dt>
          <dd className="mt-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {preview.prohibited}
          </dd>
        </div>
        {mode === 'generation' && preview.imagePrompt ? (
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Prompt de imagen
            </dt>
            <dd className="mt-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {preview.imagePrompt}
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Validación de imágenes
            </dt>
            <dd className="mt-0.5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {preview.imageValidation}
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}
