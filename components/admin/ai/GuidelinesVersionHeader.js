'use client'

import React from 'react'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-PR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const SAVE_STATUS = {
  clean: { label: 'Sin cambios pendientes', tone: 'text-gray-500 dark:text-gray-400' },
  dirty: { label: 'Cambios sin guardar', tone: 'text-amber-700 dark:text-amber-300' },
  saving: { label: 'Guardando…', tone: 'text-blue-700 dark:text-blue-300' },
  saved: { label: 'Cambios guardados', tone: 'text-green-700 dark:text-green-300' },
  error: { label: 'No se pudo guardar', tone: 'text-red-700 dark:text-red-300' },
  conflict: {
    label: 'Hay cambios de otra sesión',
    tone: 'text-amber-700 dark:text-amber-300',
  },
}

export default function GuidelinesVersionHeader({
  active,
  draft,
  viewMode = 'active',
  autosaveStatus = 'clean',
  canWrite,
  loading = false,
  onCreateDraft,
  onSetViewMode,
  onReview,
  onDiscard,
  onRetrySave,
}) {
  const hasDraft = Boolean(draft)
  const viewingDraft = viewMode === 'draft' && hasDraft
  const status = SAVE_STATUS[autosaveStatus] || SAVE_STATUS.clean
  const displayed = viewingDraft ? draft?.document : active
  const reviewBlocked = autosaveStatus === 'error' || autosaveStatus === 'conflict'

  return (
    <section className="sticky top-0 z-20 -mx-4 mb-5 border-y border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:mx-0 md:rounded-xl md:border md:px-5 dark:border-gray-700 dark:bg-gray-900/95">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                viewingDraft
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                  : 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100'
              }`}
            >
              {viewingDraft ? 'Cambios en curso' : 'Versión en uso'}
            </span>
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {viewingDraft
                ? `Desde ${draft?.basedOn || active?.version || '—'}`
                : displayed?.version}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {viewingDraft ? (
              <>
                <span
                  id="guidelines-version-save-status"
                  className={status.tone}
                  aria-live="polite"
                >
                  {status.label}
                </span>
                {draft?.updatedAt ? ` · Última edición ${formatDate(draft.updatedAt)}` : ''}
              </>
            ) : displayed?.updatedAt ? (
              `Actualizada ${formatDate(displayed.updatedAt)}${
                displayed.updatedBy ? ` por ${displayed.updatedBy}` : ''
              }`
            ) : (
              'Esta versión se usa en nuevas generaciones y validaciones.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasDraft && (
            <div
              className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-1 dark:border-gray-600 dark:bg-gray-800"
              aria-label="Versión para consultar"
            >
              <button
                type="button"
                onClick={() => onSetViewMode?.('active')}
                aria-pressed={!viewingDraft}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet ${
                  !viewingDraft
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                En uso
              </button>
              <button
                type="button"
                onClick={() => onSetViewMode?.('draft')}
                aria-pressed={viewingDraft}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet ${
                  viewingDraft
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Cambios en curso
              </button>
            </div>
          )}

          {canWrite && !hasDraft && (
            <button
              type="button"
              onClick={onCreateDraft}
              disabled={loading}
              className="rounded-lg bg-sac-primary-violet px-4 py-2 text-sm font-semibold text-white hover:bg-sac-primary-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
            >
              Editar guías
            </button>
          )}

          {canWrite && viewingDraft && (
            <>
              {(autosaveStatus === 'error' || autosaveStatus === 'conflict') && (
                <button
                  type="button"
                  onClick={onRetrySave}
                  disabled={loading}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                >
                  Reintentar
                </button>
              )}
              <button
                type="button"
                onClick={onReview}
                disabled={loading || reviewBlocked}
                aria-describedby="guidelines-version-save-status"
                className="rounded-lg bg-sac-primary-violet px-4 py-2 text-sm font-semibold text-white hover:bg-sac-primary-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
              >
                Revisar y activar
              </button>
              <details className="relative">
                <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                  <span aria-hidden="true">•••</span>
                  <span className="sr-only">Más acciones</span>
                </summary>
                <div className="absolute right-0 z-30 mt-2 w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={onDiscard}
                    disabled={loading}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-900/20"
                  >
                    Descartar cambios
                  </button>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
