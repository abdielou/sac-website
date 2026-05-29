'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { sanitizeFamilyMemberName, sanitizeFamilyMemberNames } from '@/lib/family-members'
import { useUpdateFamilyMembers } from '@/lib/hooks/useAdminData'
import { AdminFamilyPhotoUploadModal } from '@/components/admin/AdminFamilyPhotoUploadModal'
import { AdminFamilyIdCardPreviewModal } from '@/components/admin/AdminFamilyIdCardPreviewModal'

const inputClasses =
  'flex-1 min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'

/**
 * Modal for admins to manage family member names, photos, and ID cards.
 *
 * @param {{ isOpen: boolean, onClose: () => void, member: object | null }} props
 */
export function AdminFamilyManagementModal({ isOpen, onClose, member }) {
  const { mutate, isPending, error, reset: resetMutation } = useUpdateFamilyMembers()
  const [draftNames, setDraftNames] = useState([])
  const [savedNames, setSavedNames] = useState([])
  const [validationError, setValidationError] = useState(null)
  const [photoTarget, setPhotoTarget] = useState(null)
  const [previewTarget, setPreviewTarget] = useState(null)

  useEffect(() => {
    if (isOpen && member) {
      resetMutation()
      setValidationError(null)
      const members = member.familyMembers || []
      setSavedNames(members)
      setDraftNames(members.length > 0 ? [...members] : [])
      setPhotoTarget(null)
      setPreviewTarget(null)
    }
  }, [isOpen, member, resetMutation])

  const handleNameChange = (index, value) => {
    setDraftNames((prev) => prev.map((name, i) => (i === index ? value : name)))
    setValidationError(null)
  }

  const handleNameBlur = (index) => {
    setDraftNames((prev) =>
      prev.map((name, i) => (i === index ? sanitizeFamilyMemberName(name) : name))
    )
  }

  const handleAddName = () => {
    setDraftNames((prev) => [...prev, ''])
    setValidationError(null)
  }

  const handleRemoveName = (index) => {
    setDraftNames((prev) => prev.filter((_, i) => i !== index))
    setValidationError(null)
  }

  const handleSaveNames = () => {
    if (!member?.email) return

    const { names, error: sanitizeError } = sanitizeFamilyMemberNames(draftNames)
    if (sanitizeError) {
      setValidationError(sanitizeError)
      return
    }

    setValidationError(null)
    mutate(
      { email: member.email, names },
      {
        onSuccess: (data) => {
          const updated = data?.familyMembers || names
          setSavedNames(updated)
          setDraftNames(updated.length > 0 ? [...updated] : [])
        },
      }
    )
  }

  const handleDownloadId = (familyDisplayName) => {
    if (!member?.email) return

    const hasPhoto = Boolean(member.familyMemberPhotos?.[familyDisplayName])
    if (!hasPhoto) {
      alert('Este familiar no tiene foto. Se requiere una foto para generar el ID digital.')
      return
    }

    window.open(
      `/api/admin/members/${encodeURIComponent(member.email)}/family/${encodeURIComponent(familyDisplayName)}/id-card`,
      '_blank'
    )
  }

  const isNameSaved = (name) => {
    const sanitized = sanitizeFamilyMemberName(name)
    return Boolean(sanitized) && savedNames.includes(sanitized) && sanitized === name
  }

  if (!isOpen || !member) return null

  const memberName =
    member.name ||
    [member.firstName, member.initial, member.lastName, member.slastName]
      .filter(Boolean)
      .join(' ') ||
    member.email

  const photos = member.familyMemberPhotos || {}
  const hasUnsavedChanges =
    JSON.stringify(sanitizeFamilyMemberNames(draftNames).names) !== JSON.stringify(savedNames)

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Editar familiares — {memberName}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="px-6 py-6 space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Familiares</h3>
                <button
                  type="button"
                  onClick={handleAddName}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors disabled:opacity-50"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Agregar familiar
                </button>
              </div>

              {draftNames.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay familiares registrados. Usa &quot;Agregar familiar&quot; para añadir uno.
                </p>
              ) : (
                <ul className="space-y-3">
                  {draftNames.map((name, index) => {
                    const saved = isNameSaved(name)
                    const hasPhoto = saved && Boolean(photos[name])

                    return (
                      <li
                        key={index}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => handleNameChange(index, e.target.value)}
                            onBlur={() => handleNameBlur(index)}
                            placeholder="Nombre completo"
                            disabled={isPending}
                            maxLength={100}
                            className={inputClasses}
                            aria-label={`Nombre del familiar ${index + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveName(index)}
                            disabled={isPending}
                            className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 shrink-0"
                            aria-label="Eliminar familiar"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>

                        {saved ? (
                          <>
                            <div className="flex items-center justify-between gap-2 pl-0.5">
                              {hasPhoto ? (
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  Con foto
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                  </svg>
                                  Sin foto
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPhotoTarget({ familyDisplayName: name })}
                                className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                              >
                                {hasPhoto ? 'Editar foto' : 'Subir foto'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewTarget({ familyDisplayName: name })}
                                className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                              >
                                Vista previa ID
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadId(name)}
                                disabled={!hasPhoto}
                                title={
                                  !hasPhoto ? 'Se requiere foto para descargar el ID' : undefined
                                }
                                className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                Descargar ID
                              </button>
                            </div>
                          </>
                        ) : (
                          name.trim() && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Guarda los cambios para subir foto o generar ID.
                            </p>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {validationError && (
                <p className="text-sm text-red-500 dark:text-red-400">{validationError}</p>
              )}
              {error && (
                <p className="text-sm text-red-500 dark:text-red-400">
                  {error.message || 'Error al guardar familiares'}
                </p>
              )}

              <button
                type="button"
                onClick={handleSaveNames}
                disabled={isPending || !hasUnsavedChanges}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AdminFamilyPhotoUploadModal
        isOpen={Boolean(photoTarget)}
        onClose={() => setPhotoTarget(null)}
        member={member}
        familyDisplayName={photoTarget?.familyDisplayName ?? null}
      />

      <AdminFamilyIdCardPreviewModal
        isOpen={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        member={member}
        familyDisplayName={previewTarget?.familyDisplayName ?? null}
      />
    </>,
    document.body
  )
}

export default AdminFamilyManagementModal
