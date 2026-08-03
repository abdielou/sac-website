'use client'

import React from 'react'
import {
  GUIDELINE_VERSION_NAME_MAX_LENGTH,
  validateGuidelineVersionName,
} from '@/lib/guideline-version-name'

const CATEGORY_ORDER = ['contentTypes', 'generalRules', 'platforms', 'images']

function sectionForIssue(issue) {
  const path = String(issue?.path || '')
  if (path.startsWith('contentTypeCatalog')) return 'types'
  if (
    path.startsWith('platforms') ||
    path.startsWith('platformLabels') ||
    path.startsWith('platformConstraints')
  )
    return 'platforms'
  return 'general'
}

function ChangeCategory({ category, onNavigate }) {
  if (!category?.changed) return null

  return (
    <section className="border-t border-gray-200 py-5 first:border-t-0 first:pt-0 dark:border-gray-700">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-gray-950 dark:text-white">{category.label}</h4>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {category.count}
        </span>
      </div>
      {category.items?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {category.items.map((item, index) => (
            <li
              key={`${item.path || item.id || item.label}-${index}`}
              className="flex items-start justify-between gap-4 text-sm"
            >
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">{item.label}</p>
                {item.fields?.length > 0 && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {item.fields.map((field) => field.label || field.key || field).join(' · ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  onNavigate?.(
                    item.section || category.section,
                    item.id,
                    item.fields?.[0]?.path || item.path || category.path
                  )
                }
                className="shrink-0 text-xs font-semibold text-sac-primary-violet hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet dark:text-sac-secondary"
              >
                Revisar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function GuidelinesActivationReview({
  validation,
  summary,
  canWrite = false,
  loading = false,
  versionName = '',
  onVersionNameChange,
  onBack,
  onActivate,
  onNavigate,
}) {
  const issues = validation?.issues || []
  const versionNameValidation = validateGuidelineVersionName(versionName)
  const canActivate =
    canWrite && validation?.ok && summary?.hasChanges && versionNameValidation.ok && !loading

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet dark:text-gray-300 dark:hover:text-white"
      >
        <span aria-hidden="true">←</span> Seguir editando
      </button>

      <header className="border-b border-gray-200 pb-6 dark:border-gray-700">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sac-primary-violet dark:text-sac-secondary">
          Último paso
        </p>
        <h3 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">
          Revisa tus cambios
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Al activarlos, comenzarán a usarse en nuevas generaciones y validaciones. Las solicitudes
          que ya comenzaron conservarán la versión anterior.
        </p>
      </header>

      {!validation?.ok && (
        <section
          role="alert"
          className="my-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
        >
          <h4 className="text-sm font-semibold text-red-900 dark:text-red-100">
            Corrige estos puntos antes de activar
          </h4>
          <ul className="mt-3 space-y-2">
            {(issues.length
              ? issues
              : (validation?.errors || []).map((message) => ({ message }))
            ).map((issue, index) => (
              <li key={`${issue.code || 'validation'}-${issue.path || index}`}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(sectionForIssue(issue), null, issue.path)}
                  className="text-left text-sm text-red-800 underline decoration-red-300 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-200 dark:decoration-red-700"
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <h4 className="mb-4 text-sm font-semibold text-gray-950 dark:text-white">
            Resumen de cambios
          </h4>
          {summary?.hasChanges ? (
            <div>
              {CATEGORY_ORDER.map((key) => (
                <ChangeCategory key={key} category={summary[key]} onNavigate={onNavigate} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              No hay cambios para activar.
            </p>
          )}
        </div>

        <aside className="h-fit rounded-xl bg-gray-100 p-5 dark:bg-gray-800">
          <p className="text-sm font-semibold text-gray-950 dark:text-white">
            {summary?.totalChanges || 0} cambios
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
            La versión actual seguirá disponible en el historial después de activar esta.
          </p>
          {!canWrite && (
            <p className="mt-3 text-xs font-medium text-gray-700 dark:text-gray-200">
              Necesitas permiso de edición para activar cambios.
            </p>
          )}

          <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="guidelines-version-name"
                className="text-sm font-semibold text-gray-950 dark:text-white"
              >
                Nombre de la versión
              </label>
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {versionName.length}/{GUIDELINE_VERSION_NAME_MAX_LENGTH}
              </span>
            </div>
            <input
              id="guidelines-version-name"
              type="text"
              value={versionName}
              maxLength={GUIDELINE_VERSION_NAME_MAX_LENGTH}
              disabled={!canWrite || loading}
              onChange={(event) => onVersionNameChange?.(event.target.value)}
              aria-describedby="guidelines-version-name-help guidelines-version-name-error"
              aria-invalid={!versionNameValidation.ok}
              className="mt-2 block w-full rounded-lg border-gray-300 bg-white text-sm text-gray-950 shadow-sm focus:border-sac-primary-violet focus:ring-sac-primary-violet disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
            <p
              id="guidelines-version-name-help"
              className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300"
            >
              Así aparecerá en el historial. El número de versión se añade automáticamente.
            </p>
            {!versionNameValidation.ok && canWrite && (
              <p
                id="guidelines-version-name-error"
                role="alert"
                className="mt-2 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {versionNameValidation.error}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onActivate}
            disabled={!canActivate}
            className="mt-5 w-full rounded-lg bg-sac-primary-violet px-4 py-2.5 text-sm font-semibold text-white hover:bg-sac-primary-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-800"
          >
            {loading ? 'Activando…' : 'Activar cambios'}
          </button>
        </aside>
      </div>
    </div>
  )
}
