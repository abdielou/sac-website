'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { CONTENT_TYPE_LABELS } from '@/lib/ai-constants'
import {
  addPlatform,
  listContentTypeEntries,
  listPlatformEntries,
  removePlatform,
} from '@/lib/ai-guidelines-draft'
import { useGuidelinesDraft } from '@/lib/hooks/useGuidelinesDraft'
import GuidelinesActivityFeed from '@/components/admin/ai/GuidelinesActivityFeed'
import GuidelinesPreview from '@/components/admin/ai/GuidelinesPreview'
import GuidelinesSectionCard from '@/components/admin/ai/GuidelinesSectionCard'
import GuidelinesVersionHeader from '@/components/admin/ai/GuidelinesVersionHeader'
import GuidelinesVersionHistory from '@/components/admin/ai/GuidelinesVersionHistory'

const textareaClass =
  'w-full min-h-[120px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100'

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100'

export default function GuidelinesClient() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canWrite = accessibleActions.includes('write_ai')

  const {
    hydrated,
    loading,
    error,
    active,
    draft,
    displayDoc,
    isEditing,
    versions,
    auditLog,
    createDraftFromActive,
    updateDraft,
    saveDraft,
    activateDraftVersion,
    discardDraft,
    rollbackVersion,
  } = useGuidelinesDraft({ canWrite })

  const [newPlatformName, setNewPlatformName] = useState('')
  const [platformError, setPlatformError] = useState(null)

  if (!hydrated || !displayDoc) {
    return <div className="text-gray-500 dark:text-gray-400">Cargando guías...</div>
  }

  const editable = canWrite && isEditing
  const draftDoc = draft?.document
  const platformEntries = listPlatformEntries(displayDoc)
  const contentTypeEntries = listContentTypeEntries(displayDoc)
  const generation = displayDoc.generation || {}

  const updatePlatformRules = (platformId, value) => {
    if (!draftDoc) return
    updateDraft({
      platforms: {
        ...draftDoc.platforms,
        [platformId]: value,
      },
    })
  }

  const updatePlatformLabel = (platformId, value) => {
    if (!draftDoc) return
    updateDraft({
      platformLabels: {
        ...(draftDoc.platformLabels || {}),
        [platformId]: value,
      },
    })
  }

  const updateContentTypeRules = (contentTypeId, value) => {
    if (!draftDoc) return
    updateDraft({
      contentTypes: {
        ...(draftDoc.contentTypes || {}),
        [contentTypeId]: value,
      },
    })
  }

  const updateGenerationField = (field, value) => {
    if (!draftDoc) return
    updateDraft({
      generation: {
        ...(draftDoc.generation || {}),
        [field]: value,
      },
    })
  }

  const updateGenerationPlatformRules = (platformId, value) => {
    if (!draftDoc) return
    const current = draftDoc.generation || {}
    updateDraft({
      generation: {
        ...current,
        platforms: {
          ...(current.platforms || {}),
          [platformId]: value,
        },
      },
    })
  }

  const updateGenerationContentTypeRules = (contentTypeId, value) => {
    if (!draftDoc) return
    const current = draftDoc.generation || {}
    updateDraft({
      generation: {
        ...current,
        contentTypes: {
          ...(current.contentTypes || {}),
          [contentTypeId]: value,
        },
      },
    })
  }

  const handleAddPlatform = () => {
    if (!draftDoc) return
    setPlatformError(null)
    try {
      const next = addPlatform(draftDoc, newPlatformName)
      updateDraft({
        platforms: next.platforms,
        platformLabels: next.platformLabels,
      })
      setNewPlatformName('')
    } catch (err) {
      setPlatformError(err.message || 'No se pudo añadir la plataforma.')
    }
  }

  const handleRemovePlatform = (platformId) => {
    if (!draftDoc) return
    setPlatformError(null)
    try {
      const next = removePlatform(draftDoc, platformId)
      updateDraft({
        platforms: next.platforms,
        platformLabels: next.platformLabels,
      })
    } catch (err) {
      setPlatformError(err.message || 'No se pudo eliminar la plataforma.')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Gestión de guías de IA
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Define la voz de marca, reglas por plataforma y restricciones que orientan a los agentes de
        validación y generación. Solo la versión activa afecta los workflows.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <GuidelinesVersionHeader
        active={isEditing ? draftDoc : active}
        basedOn={draft?.basedOn}
        isEditing={isEditing}
        canWrite={canWrite}
        hasDraft={Boolean(draft)}
        loading={loading}
        onCreateDraft={createDraftFromActive}
        onSaveDraft={saveDraft}
        onActivate={activateDraftVersion}
        onDiscard={discardDraft}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GuidelinesSectionCard title="Voz de Marca" editable={canWrite && !isEditing}>
              {editable ? (
                <textarea
                  className={textareaClass}
                  value={draftDoc.global}
                  onChange={(e) => updateDraft({ global: e.target.value })}
                />
              ) : (
                displayDoc.global
              )}
            </GuidelinesSectionCard>

            <GuidelinesSectionCard title="Contenido Prohibido" editable={canWrite && !isEditing}>
              {editable ? (
                <textarea
                  className={textareaClass}
                  value={draftDoc.prohibited}
                  onChange={(e) => updateDraft({ prohibited: e.target.value })}
                />
              ) : (
                displayDoc.prohibited
              )}
            </GuidelinesSectionCard>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Reglas por Plataforma"
                editable={canWrite && !isEditing}
              >
                <div className="space-y-4">
                  {platformEntries.map((entry) => (
                    <div key={entry.id} className="space-y-2">
                      {editable ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            className={`${inputClass} max-w-xs`}
                            value={entry.label}
                            onChange={(e) => updatePlatformLabel(entry.id, e.target.value)}
                            aria-label={`Nombre de plataforma ${entry.id}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePlatform(entry.id)}
                            disabled={platformEntries.length <= 1 || loading}
                            className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          {entry.label}
                        </p>
                      )}
                      {editable ? (
                        <textarea
                          className={textareaClass}
                          value={draftDoc.platforms[entry.id] || ''}
                          onChange={(e) => updatePlatformRules(entry.id, e.target.value)}
                        />
                      ) : (
                        <p>{entry.rules}</p>
                      )}
                    </div>
                  ))}

                  {editable && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Añadir plataforma
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          className={`${inputClass} max-w-xs`}
                          placeholder="Nombre (ej. Threads)"
                          value={newPlatformName}
                          onChange={(e) => {
                            setNewPlatformName(e.target.value)
                            setPlatformError(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddPlatform()
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddPlatform}
                          className="rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-2 text-sm font-medium hover:opacity-90"
                        >
                          Añadir
                        </button>
                      </div>
                      {platformError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{platformError}</p>
                      )}
                    </div>
                  )}
                </div>
              </GuidelinesSectionCard>
            </div>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Reglas por tipo de contenido (validación)"
                editable={canWrite && !isEditing}
              >
                <div className="space-y-4">
                  {contentTypeEntries.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Sin tipos de contenido definidos.
                    </p>
                  ) : (
                    contentTypeEntries.map((entry) => (
                      <div key={entry.id} className="space-y-1">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {CONTENT_TYPE_LABELS[entry.id] || entry.label}
                        </p>
                        {editable ? (
                          <textarea
                            className={textareaClass}
                            value={draftDoc.contentTypes?.[entry.id] || ''}
                            onChange={(e) => updateContentTypeRules(entry.id, e.target.value)}
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{entry.rules}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </GuidelinesSectionCard>
            </div>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Validación de Imágenes"
                editable={canWrite && !isEditing}
              >
                {editable ? (
                  <textarea
                    className={textareaClass}
                    value={draftDoc.imageValidation}
                    onChange={(e) => updateDraft({ imageValidation: e.target.value })}
                  />
                ) : (
                  displayDoc.imageValidation
                )}
              </GuidelinesSectionCard>
            </div>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Generación — voz global"
                editable={canWrite && !isEditing}
              >
                {editable ? (
                  <textarea
                    className={textareaClass}
                    value={draftDoc.generation?.global || ''}
                    onChange={(e) => updateGenerationField('global', e.target.value)}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{generation.global || '—'}</p>
                )}
              </GuidelinesSectionCard>
            </div>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Generación — reglas por plataforma"
                editable={canWrite && !isEditing}
              >
                <div className="space-y-4">
                  {platformEntries.map((entry) => (
                    <div key={`gen-plat-${entry.id}`} className="space-y-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {entry.label}
                      </p>
                      {editable ? (
                        <textarea
                          className={textareaClass}
                          value={draftDoc.generation?.platforms?.[entry.id] || ''}
                          onChange={(e) => updateGenerationPlatformRules(entry.id, e.target.value)}
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">
                          {generation.platforms?.[entry.id] || '—'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </GuidelinesSectionCard>
            </div>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Generación — reglas por tipo de contenido"
                editable={canWrite && !isEditing}
              >
                <div className="space-y-4">
                  {contentTypeEntries.map((entry) => (
                    <div key={`gen-ct-${entry.id}`} className="space-y-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {CONTENT_TYPE_LABELS[entry.id] || entry.label}
                      </p>
                      {editable ? (
                        <textarea
                          className={textareaClass}
                          value={draftDoc.generation?.contentTypes?.[entry.id] || ''}
                          onChange={(e) =>
                            updateGenerationContentTypeRules(entry.id, e.target.value)
                          }
                        />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">
                          {generation.contentTypes?.[entry.id] || '—'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </GuidelinesSectionCard>
            </div>

            <div className="lg:col-span-2">
              <GuidelinesSectionCard
                title="Generación — prompts de imagen"
                editable={canWrite && !isEditing}
              >
                {editable ? (
                  <textarea
                    className={textareaClass}
                    value={draftDoc.generation?.imagePrompt || ''}
                    onChange={(e) => updateGenerationField('imagePrompt', e.target.value)}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{generation.imagePrompt || '—'}</p>
                )}
              </GuidelinesSectionCard>
            </div>
          </div>

          <GuidelinesPreview doc={displayDoc} />

          <GuidelinesVersionHistory
            versions={versions}
            canWrite={canWrite}
            loading={loading}
            onRollback={rollbackVersion}
          />
        </div>

        <GuidelinesActivityFeed events={auditLog} />
      </div>

      {!canWrite && (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Solo lectura. Se requiere permiso <code className="text-xs">write_ai</code> para crear o
          editar borradores.
        </p>
      )}
    </div>
  )
}
