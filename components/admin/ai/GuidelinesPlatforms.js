'use client'

import React, { useEffect, useRef, useState } from 'react'
import GuidelinesDraftActionBar from '@/components/admin/ai/GuidelinesDraftActionBar'

const textareaClass =
  'mt-2 min-h-[170px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-900 shadow-sm focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400'

export default function GuidelinesPlatforms({
  entries = [],
  document,
  editable,
  canStartEditing = false,
  selectedId: controlledSelectedId,
  onSelectedIdChange,
  onStartEditing,
  loading = false,
  draftActionLoading = false,
  autosaveStatus = 'clean',
  error,
  onReview,
  onRetrySave,
  onUpdateLabel,
  onUpdateRules,
  onUpdateCaptionLimit,
  onRemove,
  onAdd,
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(entries[0]?.id || '')
  const [newPlatformName, setNewPlatformName] = useState('')
  const selectedHeadingRef = useRef(null)
  const wasEditableRef = useRef(editable)
  const requestedSelectedId = controlledSelectedId ?? internalSelectedId
  const selected = entries.find(({ id }) => id === requestedSelectedId) || entries[0] || null

  useEffect(() => {
    if (
      controlledSelectedId === undefined &&
      !entries.some(({ id }) => id === internalSelectedId)
    ) {
      setInternalSelectedId(entries[0]?.id || '')
    }
  }, [controlledSelectedId, entries, internalSelectedId])

  useEffect(() => {
    if (editable && !wasEditableRef.current) selectedHeadingRef.current?.focus()
    wasEditableRef.current = editable
  }, [editable])

  const captionMaxCharacters = selected
    ? (document?.platformConstraints?.[selected.id]?.captionMaxCharacters ?? null)
    : null

  const selectPlatform = (id) => {
    if (controlledSelectedId === undefined) setInternalSelectedId(id)
    onSelectedIdChange?.(id)
  }

  const handleAddPlatform = () => {
    const name = newPlatformName.trim()
    if (!name || loading) return
    const addedId = onAdd?.(name)
    setNewPlatformName('')
    if (addedId) selectPlatform(addedId)
  }

  return (
    <div>
      <header className="mb-6">
        <h3 className="text-lg font-semibold text-gray-950 dark:text-white">Redes sociales</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Define qué debe cumplir el contenido en cada red. El documento inicial incluye las redes
          actuales de SAC; puedes añadir o quitar redes al activar un borrador.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label="Redes configuradas">
          <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {entries.map((entry) => {
              const active = entry.id === selected?.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => selectPlatform(entry.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet lg:w-full ${
                    active
                      ? 'bg-sac-primary-violet text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                  }`}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>

          {editable && (
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <label
                htmlFor="platform-add-name"
                className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Añadir red
              </label>
              <div className="flex flex-col gap-2">
                <input
                  id="platform-add-name"
                  type="text"
                  value={newPlatformName}
                  onChange={(event) => setNewPlatformName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddPlatform()
                    }
                  }}
                  placeholder="Nombre, p. ej. Threads"
                  disabled={loading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleAddPlatform}
                  disabled={loading || !newPlatformName.trim()}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-sac-primary-violet hover:text-sac-primary-violet disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:border-sac-secondary dark:hover:text-sac-secondary"
                >
                  Añadir
                </button>
              </div>
            </div>
          )}
        </aside>

        {selected ? (
          <div className="min-w-0 space-y-8">
            <div className="border-b border-gray-200 pb-5 dark:border-gray-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4
                    ref={selectedHeadingRef}
                    tabIndex={editable ? -1 : undefined}
                    className="text-xl font-semibold text-gray-950 outline-none dark:text-white"
                  >
                    {selected.label}
                  </h4>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Expectativas que se añaden a las reglas generales.
                  </p>
                </div>
                {canStartEditing && !editable && onStartEditing && (
                  <button
                    type="button"
                    onClick={() => onStartEditing?.(selected.id)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-sac-primary-violet hover:text-sac-primary-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sac-primary-violet focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sac-secondary dark:hover:text-sac-secondary dark:focus-visible:ring-offset-gray-900"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path
                        d="m13.9 3.6 2.5 2.5M4 16l3.1-.7 9-9a1.8 1.8 0 0 0-2.5-2.5l-9 9L4 16Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Editar {selected.label}
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => onRemove?.(selected.id)}
                    disabled={loading || entries.length <= 1}
                    className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50 dark:text-red-300"
                  >
                    Dejar de usar esta red
                  </button>
                )}
              </div>
              {editable && (
                <div className="mt-5 max-w-sm">
                  <label
                    htmlFor={`platform-${selected.id}-label`}
                    className="text-sm font-medium text-gray-800 dark:text-gray-200"
                  >
                    Nombre visible
                  </label>
                  <input
                    id={`platform-${selected.id}-label`}
                    type="text"
                    value={selected.label || ''}
                    onChange={(event) => onUpdateLabel?.(selected.id, event.target.value)}
                    disabled={loading}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              )}
            </div>

            <section>
              <label
                htmlFor={`platform-${selected.id}-caption-limit`}
                className="text-base font-semibold text-gray-950 dark:text-white"
              >
                Máximo de caracteres del caption
              </label>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Déjalo vacío si {selected.label} no impone un límite. Cuando un caption se comparte,
                se respeta el menor límite de las redes donde se publicará.
              </p>
              {editable ? (
                <input
                  id={`platform-${selected.id}-caption-limit`}
                  type="number"
                  min="1"
                  max="20000"
                  inputMode="numeric"
                  value={captionMaxCharacters ?? ''}
                  onChange={(event) =>
                    onUpdateCaptionLimit?.(
                      selected.id,
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                  className="mt-3 w-48 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-sac-primary-violet focus:outline-none focus:ring-2 focus:ring-sac-primary-violet/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              ) : (
                <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                  {captionMaxCharacters
                    ? `${captionMaxCharacters.toLocaleString('es-PR')} caracteres`
                    : 'Sin límite específico'}
                </p>
              )}
            </section>

            <section>
              <label
                htmlFor={`platform-${selected.id}-rules`}
                className="text-base font-semibold text-gray-950 dark:text-white"
              >
                Qué debe cumplir el contenido
              </label>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Describe el resultado esperado para {selected.label}. Se usa tanto al crear como al
                revisar contenido. Define la longitud en el campo numérico de arriba.
              </p>
              {editable ? (
                <textarea
                  id={`platform-${selected.id}-rules`}
                  className={textareaClass}
                  value={selected.rules || ''}
                  onChange={(event) => onUpdateRules?.(selected.id, event.target.value)}
                />
              ) : (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                  {selected.rules || 'No hay expectativas específicas.'}
                </p>
              )}
            </section>

            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

            {editable && (
              <GuidelinesDraftActionBar
                autosaveStatus={autosaveStatus}
                loading={draftActionLoading}
                onReview={onReview}
                onRetrySave={onRetrySave}
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            No hay redes sociales configuradas.
          </div>
        )}
      </div>
    </div>
  )
}
