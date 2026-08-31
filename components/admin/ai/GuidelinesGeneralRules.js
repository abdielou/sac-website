'use client'

import React from 'react'

const MAX_RULE_LENGTH = 20_000

const RULES = [
  {
    key: 'global',
    id: 'guidelines-brand-voice',
    title: 'Voz y tono general',
    description: 'Cómo debe sonar el contenido y representar a la organización.',
    placeholder: 'Ej.: Escribe en español claro, con un tono cercano, educativo y preciso…',
  },
  {
    key: 'prohibited',
    id: 'guidelines-prohibited',
    title: 'Qué debe evitar',
    description: 'Límites que el SAC quiere aplicar a todo el contenido.',
    placeholder: 'Ej.: No presentar afirmaciones pseudocientíficas como hechos verificados…',
  },
  {
    key: 'imageValidation',
    id: 'guidelines-image-validation',
    title: 'Al revisar imágenes',
    description: 'Qué debe comprobar sobre accesibilidad, calidad y relación con el mensaje.',
    placeholder: 'Ej.: Comprueba legibilidad, texto alternativo y coherencia con la publicación…',
  },
  {
    key: 'generation.imagePrompt',
    id: 'guidelines-image-generation',
    title: 'Al crear imágenes',
    description: 'Cómo deben prepararse las imágenes que acompañan una publicación.',
    placeholder: 'Ej.: Crea una escena alineada con el mensaje sin añadir hechos no provistos…',
  },
]

const textareaClass =
  'mt-3 min-h-[170px] w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-600 dark:disabled:bg-gray-800 dark:disabled:text-gray-400'

function valueForRule(document, key) {
  if (key === 'generation.imagePrompt') return document?.generation?.imagePrompt || ''
  return document?.[key] || ''
}

function patchForRule(document, key, value) {
  if (key === 'generation.imagePrompt') {
    return { generation: { ...(document?.generation || {}), imagePrompt: value } }
  }
  return { [key]: value }
}

export default function GuidelinesGeneralRules({ document, editable, onChange }) {
  return (
    <div className="max-w-4xl">
      <header className="border-b border-gray-200 pb-6 dark:border-gray-700">
        <h3 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white">
          Reglas generales
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Escribe las instrucciones que deben aplicarse a cualquier publicación. Las reglas de cada
          tipo de contenido y red social se añadirán después.
        </p>
      </header>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {RULES.map((rule) => {
          const value = valueForRule(document, rule.key)
          return (
            <section key={rule.key} id={`${rule.id}-section`} className="scroll-mt-40 py-7">
              {editable ? (
                <label
                  htmlFor={rule.id}
                  className="text-base font-semibold text-gray-950 dark:text-white"
                >
                  {rule.title}
                </label>
              ) : (
                <h4 className="text-base font-semibold text-gray-950 dark:text-white">
                  {rule.title}
                </h4>
              )}
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {rule.description}
              </p>

              {editable ? (
                <textarea
                  id={rule.id}
                  className={textareaClass}
                  value={value}
                  placeholder={rule.placeholder}
                  maxLength={MAX_RULE_LENGTH}
                  onChange={(event) =>
                    onChange?.(patchForRule(document, rule.key, event.target.value))
                  }
                />
              ) : (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-200">
                  {value || 'No hay instrucciones definidas.'}
                </p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
