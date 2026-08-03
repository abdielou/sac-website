'use client'

import React, { useEffect, useMemo, useState } from 'react'
import GenerationForm, { DEFAULT_GENERATION_FORM } from '@/components/admin/ai/GenerationForm'
import ValidationForm, { DEFAULT_FORM } from '@/components/admin/ai/ValidationForm'

function validationStateFor(id, platform) {
  return { ...DEFAULT_FORM, platform, contentType: id }
}

function generationStateFor(id) {
  return { ...DEFAULT_GENERATION_FORM, contentType: id }
}

/**
 * Renders the same forms used by Validar and Generar against one in-progress definition.
 * The submit controls are intentionally hidden and submit handlers never call the API.
 */
export default function GuidelinesContentTypePreview({
  definition,
  platforms = [],
  onClose,
  drawer = false,
}) {
  const [mode, setMode] = useState('validation')
  const preferredPlatform = platforms.some(({ id }) => id === 'instagram')
    ? 'instagram'
    : platforms[0]?.id || ''
  const [validationState, setValidationState] = useState(() =>
    validationStateFor(definition?.id || '', preferredPlatform)
  )
  const [generationState, setGenerationState] = useState(() =>
    generationStateFor(definition?.id || '')
  )
  const [images, setImages] = useState([])

  const contentTypes = useMemo(
    () =>
      definition
        ? [{ id: definition.id, label: definition.label || 'Sin nombre', definition }]
        : [],
    [definition]
  )

  useEffect(() => {
    const id = definition?.id || ''
    setValidationState(validationStateFor(id, preferredPlatform))
    setGenerationState(generationStateFor(id))
    setImages([])
  }, [definition?.id, preferredPlatform])

  if (!definition) return null

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-900"
      aria-labelledby="content-type-preview-heading"
    >
      <header className="shrink-0 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#560647] dark:text-[#e5b9dc]">
              Vista previa
            </p>
            <h3
              id="content-type-preview-heading"
              className="mt-1 truncate text-sm font-semibold text-gray-950 dark:text-white"
            >
              {definition.label || 'Sin nombre'}
            </h3>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              aria-label="Cerrar vista previa"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5 5 15"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div
          className="mt-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
          role="tablist"
          aria-label="Formulario que se mostrará"
        >
          {[
            ['validation', 'Validar'],
            ['generation', 'Generar'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#560647] ${
                mode === id
                  ? 'bg-white text-[#560647] shadow-sm dark:bg-gray-700 dark:text-[#f0cde9]'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Este es el formulario real. Puedes probar sus campos; aquí no se ejecuta el asistente.
        </p>
      </header>

      <div
        className={`guidelines-form-preview min-h-0 flex-1 overflow-y-auto px-4 py-5 [&_button[type=submit]]:hidden ${
          drawer ? 'sm:px-6' : 'guidelines-form-preview--narrow'
        }`}
      >
        {mode === 'validation' ? (
          <ValidationForm
            canValidate
            formState={validationState}
            onFormChange={setValidationState}
            images={images}
            onImagesChange={setImages}
            onSubmit={() => {}}
            platforms={platforms}
            contentTypes={contentTypes}
          />
        ) : (
          <GenerationForm
            canGenerate
            formState={generationState}
            onFormChange={setGenerationState}
            onSubmit={() => {}}
            contentTypes={contentTypes}
          />
        )}
      </div>

      <style jsx>{`
        .guidelines-form-preview--narrow :global(form .grid) {
          grid-template-columns: minmax(0, 1fr);
        }

        .guidelines-form-preview--narrow :global(form [class*='col-span']) {
          grid-column: 1 / -1;
        }
      `}</style>
    </section>
  )
}
