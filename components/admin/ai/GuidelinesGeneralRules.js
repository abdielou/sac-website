'use client'

import React from 'react'

const textareaClass =
  'mt-2 min-h-[180px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 shadow-sm focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400'

function RuleField({ id, title, description, value, editable, onChange }) {
  return (
    <section className="border-b border-gray-200 pb-8 last:border-b-0 last:pb-0 dark:border-gray-700">
      <label htmlFor={id} className="text-base font-semibold text-gray-950 dark:text-white">
        {title}
      </label>
      <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{description}</p>
      {editable ? (
        <textarea id={id} className={textareaClass} value={value || ''} onChange={onChange} />
      ) : (
        <div className="mt-3 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
          {value || 'No hay reglas definidas.'}
        </div>
      )}
    </section>
  )
}

export default function GuidelinesGeneralRules({ document, editable, onChange }) {
  const generation = document?.generation || {}

  return (
    <div className="max-w-5xl space-y-8">
      <header>
        <h3 className="text-lg font-semibold text-gray-950 dark:text-white">Reglas generales</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Estas reglas se aplican a todos los tipos de contenido y redes sociales.
        </p>
      </header>

      <RuleField
        id="guidelines-brand-voice"
        title="Voz y tono del SAC"
        description="Explica cómo debe sonar el contenido, qué idioma prioriza y cómo representa a la organización."
        value={document?.global}
        editable={editable}
        onChange={(event) => onChange?.({ global: event.target.value })}
      />
      <RuleField
        id="guidelines-generation-global"
        title="Al generar contenido"
        description="Indica cómo preservar datos, manejar información faltante y preparar borradores para revisión."
        value={generation.global}
        editable={editable}
        onChange={(event) =>
          onChange?.({ generation: { ...generation, global: event.target.value } })
        }
      />
      <RuleField
        id="guidelines-prohibited"
        title="Qué debe evitar"
        description="Añade restricciones propias del SAC además de los límites permanentes del asistente."
        value={document?.prohibited}
        editable={editable}
        onChange={(event) => onChange?.({ prohibited: event.target.value })}
      />
      <RuleField
        id="guidelines-image-validation"
        title="Cómo validar imágenes"
        description="Define los criterios comunes de accesibilidad, calidad y relación entre texto e imagen."
        value={document?.imageValidation}
        editable={editable}
        onChange={(event) => onChange?.({ imageValidation: event.target.value })}
      />
      <RuleField
        id="guidelines-image-generation"
        title="Cómo generar imágenes"
        description="Describe las instrucciones comunes para crear imágenes relacionadas con cada publicación."
        value={generation.imagePrompt}
        editable={editable}
        onChange={(event) =>
          onChange?.({ generation: { ...generation, imagePrompt: event.target.value } })
        }
      />
    </div>
  )
}
