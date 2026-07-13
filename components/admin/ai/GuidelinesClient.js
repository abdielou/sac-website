'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  addPlatform,
  listPlatformEntries,
  removePlatform,
} from '@/lib/ai-guidelines-draft'
import { useGuidelinesDraft } from '@/lib/hooks/useGuidelinesDraft'
import GuidelinesActivityFeed from '@/components/admin/ai/GuidelinesActivityFeed'
import GuidelinesSectionCard from '@/components/admin/ai/GuidelinesSectionCard'
import GuidelinesVersionHeader from '@/components/admin/ai/GuidelinesVersionHeader'

const textareaClass =
  'w-full min-h-[120px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100'

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100'

export default function GuidelinesClient() {
  const { data: session } = useSession()
  const accessibleActions = session?.user?.accessibleActions || []
  const canWrite = accessibleActions.includes('write_ai')
  const userName = session?.user?.name || session?.user?.email || 'Usuario'

  const {
    hydrated,
    active,
    draft,
    displayDoc,
    isEditing,
    auditLog,
    createDraftFromActive,
    updateDraft,
    saveDraft,
    activateDraftVersion,
    discardDraft,
  } = useGuidelinesDraft({ canWrite, userName })

  const [newPlatformName, setNewPlatformName] = useState('')
  const [platformError, setPlatformError] = useState(null)

  if (!hydrated || !displayDoc) {
    return <div className="text-gray-500 dark:text-gray-400">Cargando guías...</div>
  }

  const editable = canWrite && isEditing
  const platformEntries = listPlatformEntries(displayDoc)

  const updatePlatformRules = (platformId, value) => {
    updateDraft({
      platforms: {
        ...draft.platforms,
        [platformId]: value,
      },
    })
  }

  const updatePlatformLabel = (platformId, value) => {
    updateDraft({
      platformLabels: {
        ...(draft.platformLabels || {}),
        [platformId]: value,
      },
    })
  }

  const handleAddPlatform = () => {
    setPlatformError(null)
    try {
      const next = addPlatform(draft, newPlatformName)
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
    setPlatformError(null)
    try {
      const next = removePlatform(draft, platformId)
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
        validación y generación.
      </p>

      <div
        role="note"
        className="mb-6 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-200"
      >
        <p className="font-medium">Vista previa local</p>
        <p className="mt-1 text-blue-800 dark:text-blue-300/90">
          Los cambios se guardan en este navegador. Los workflows de validación y generación siguen
          usando las guías del servidor hasta que se implemente el almacenamiento versionado (Phase
          3).
        </p>
      </div>

      <GuidelinesVersionHeader
        active={isEditing ? draft : active}
        isEditing={isEditing}
        canWrite={canWrite}
        hasDraft={Boolean(draft)}
        onCreateDraft={createDraftFromActive}
        onSaveDraft={saveDraft}
        onActivate={activateDraftVersion}
        onDiscard={discardDraft}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GuidelinesSectionCard title="Voz de Marca" editable={canWrite && !isEditing}>
            {editable ? (
              <textarea
                className={textareaClass}
                value={draft.global}
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
                value={draft.prohibited}
                onChange={(e) => updateDraft({ prohibited: e.target.value })}
              />
            ) : (
              displayDoc.prohibited
            )}
          </GuidelinesSectionCard>

          <div className="lg:col-span-2">
            <GuidelinesSectionCard title="Reglas por Plataforma" editable={canWrite && !isEditing}>
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
                          disabled={platformEntries.length <= 1}
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
                        value={draft.platforms[entry.id] || ''}
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
              title="Validación de Imágenes"
              editable={canWrite && !isEditing}
            >
              {editable ? (
                <textarea
                  className={textareaClass}
                  value={draft.imageValidation}
                  onChange={(e) => updateDraft({ imageValidation: e.target.value })}
                />
              ) : (
                displayDoc.imageValidation
              )}
            </GuidelinesSectionCard>
          </div>
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
