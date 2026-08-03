'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  listContentTypeEntries,
  listPlatformEntries,
  previewGuidelinesAgainstDocument,
  resolveContentTypeOptions,
  resolvePlatformOptions,
} from '@/lib/ai-guidelines-draft'
import { resolveContentTypeDefinition } from '@/lib/ai-guidelines-schema'

const controlClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100'

function PreviewControl({ id, label, children }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * Client-side explanation of which guideline layers apply to a sample post.
 */
export default function GuidelinesPreview({ doc, embedded = false }) {
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
  const contentTypeDefinition = useMemo(
    () => resolveContentTypeDefinition(doc, contentType),
    [doc, contentType]
  )

  useEffect(() => {
    if (platformOptions.some(({ id }) => id === platform)) return
    setPlatform(platformOptions[0]?.id || '')
  }, [platform, platformOptions])

  useEffect(() => {
    if (contentTypeOptions.some(({ id }) => id === contentType)) return
    setContentType(contentTypeOptions[0]?.id || '')
  }, [contentType, contentTypeOptions])

  const platformLabel = listPlatformEntries(doc).find((p) => p.id === platform)?.label || platform
  const contentTypeLabel =
    listContentTypeEntries(doc).find((c) => c.id === contentType)?.label || contentType
  const appliedRules = [
    { label: 'Voz y tono general', value: preview.global },
    { label: 'Red social', value: preview.platform },
    { label: 'Tipo de contenido', value: preview.contentType },
    { label: 'Qué debe evitar', value: preview.prohibited },
    mode === 'generation'
      ? { label: 'Generación de imágenes', value: preview.imagePrompt }
      : { label: 'Validación de imágenes', value: preview.imageValidation },
  ].filter(({ value }) => value)

  return (
    <section
      aria-labelledby="guidelines-preview-title"
      className={
        embedded
          ? ''
          : 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6 dark:border-gray-700 dark:bg-gray-900'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-sac-primary-violet dark:text-violet-300">
            Simulación local
          </p>
          <h3
            id="guidelines-preview-title"
            className="mt-1 text-base font-semibold text-gray-950 dark:text-white"
          >
            Aplicación de muestra
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-600 dark:text-gray-300">
            Muestra las capas de reglas que recibiría el asistente. No ejecuta IA ni guarda el
            texto.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          Solo vista previa
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PreviewControl id="guidelines-preview-mode" label="Tarea">
          <select
            id="guidelines-preview-mode"
            className={controlClass}
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="validation">Validar contenido</option>
            <option value="generation">Generar contenido</option>
          </select>
        </PreviewControl>
        <PreviewControl id="guidelines-preview-platform" label="Red social">
          <select
            id="guidelines-preview-platform"
            className={controlClass}
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
          >
            {platformOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </PreviewControl>
        <PreviewControl id="guidelines-preview-content-type" label="Tipo de contenido">
          <select
            id="guidelines-preview-content-type"
            className={controlClass}
            value={contentType}
            onChange={(event) => setContentType(event.target.value)}
          >
            {contentTypeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </PreviewControl>
      </div>

      <div className="mt-4">
        <PreviewControl id="guidelines-preview-sample" label="Publicación de ejemplo">
          <textarea
            id="guidelines-preview-sample"
            className={`${controlClass} min-h-[88px] resize-y`}
            value={sampleText}
            onChange={(event) => setSampleText(event.target.value)}
          />
        </PreviewControl>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Sirve como contexto visual; el simulador no analiza su contenido.
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
              {mode === 'generation' ? 'Generación' : 'Validación'}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
              {platformLabel}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
              {contentTypeLabel}
            </span>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              {preview.version}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
            {sampleText || 'Sin texto de ejemplo.'}
          </p>
        </div>

        {contentTypeDefinition && (
          <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Formulario y comportamiento visual
            </p>
            <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
              {(contentTypeDefinition.fields || [])
                .map((field) => `${field.label}${field.required ? ' *' : ''}`)
                .join(' · ') || 'Sin campos adicionales'}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Modo: {contentTypeDefinition.visual?.mode || 'none'}
              {contentTypeDefinition.visual?.template
                ? ` · Plantilla: ${contentTypeDefinition.visual.template}`
                : ''}
              {contentTypeDefinition.visual?.backgroundSources?.length
                ? ` · Fondos: ${contentTypeDefinition.visual.backgroundSources.join(', ')}`
                : ''}
            </p>
          </div>
        )}

        <div className="grid gap-px bg-gray-200 sm:grid-cols-2 dark:bg-gray-700">
          {appliedRules.map((rule) => (
            <div key={rule.label} className="min-w-0 bg-white p-4 dark:bg-gray-900">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{rule.label}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
                {rule.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
