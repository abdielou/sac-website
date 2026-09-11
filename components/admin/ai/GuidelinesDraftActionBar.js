'use client'

import React from 'react'

const STATUS = {
  clean: {
    label: 'Borrador listo',
    detail: 'Los cambios que hagas se guardarán automáticamente.',
    dot: 'bg-gray-400',
    tone: 'text-gray-700 dark:text-gray-200',
  },
  dirty: {
    label: 'Cambios sin guardar',
    detail: 'Se guardarán automáticamente en un momento.',
    dot: 'bg-amber-500',
    tone: 'text-amber-800 dark:text-amber-200',
  },
  saving: {
    label: 'Guardando borrador…',
    detail: 'Puedes seguir editando mientras guardamos.',
    dot: 'animate-pulse bg-blue-500 motion-reduce:animate-none',
    tone: 'text-blue-800 dark:text-blue-200',
  },
  saved: {
    label: 'Guardado automáticamente como borrador',
    detail: 'Estos cambios aún no se aplican al generador ni al validador.',
    dot: 'bg-green-500',
    tone: 'text-green-800 dark:text-green-200',
  },
  error: {
    label: 'No se pudo guardar el borrador',
    detail: 'Tus cambios siguen aquí. Reintenta el guardado.',
    dot: 'bg-red-500',
    tone: 'text-red-800 dark:text-red-200',
  },
  conflict: {
    label: 'Hay cambios de otra sesión',
    detail: 'Tus cambios siguen aquí. Reintenta antes de revisar.',
    dot: 'bg-amber-500',
    tone: 'text-amber-800 dark:text-amber-200',
  },
}

export default function GuidelinesDraftActionBar({
  autosaveStatus = 'clean',
  loading = false,
  onReview,
  onRetrySave,
}) {
  const status = STATUS[autosaveStatus] || STATUS.clean
  const saveBlocked = autosaveStatus === 'error' || autosaveStatus === 'conflict'
  const reviewDisabled = !onReview || loading || autosaveStatus === 'saving' || saveBlocked

  return (
    <aside
      aria-label="Acciones del borrador"
      className="rounded-2xl border border-gray-200 bg-gray-50/90 p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5 dark:border-gray-700 dark:bg-gray-800/70"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p id="guidelines-draft-action-status" className={`text-sm font-semibold ${status.tone}`}>
            {status.label}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {status.detail}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:mt-0 sm:shrink-0 sm:flex-row">
        {saveBlocked && onRetrySave && (
          <button
            type="button"
            onClick={onRetrySave}
            disabled={loading}
            className="min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/30 dark:focus-visible:ring-offset-gray-800"
          >
            Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={onReview}
          disabled={reviewDisabled}
          aria-describedby="guidelines-draft-action-status"
          className="min-h-11 rounded-lg bg-sac-primary-violet px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sac-primary-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-800"
        >
          {autosaveStatus === 'saving' ? 'Guardando…' : 'Revisar y activar'}
        </button>
      </div>
    </aside>
  )
}
