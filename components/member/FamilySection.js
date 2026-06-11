'use client'

import { useState } from 'react'
import { MemberFamilyPhotoModal } from '@/components/member/MemberFamilyPhotoModal'
import { MemberFamilyIdCardPreviewModal } from '@/components/member/MemberFamilyIdCardPreviewModal'

/**
 * Section card matching ProfileView styling.
 */
function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        {title}
      </h3>
      {children}
    </div>
  )
}

/**
 * Read-only family members list with photo upload and ID actions.
 *
 * @param {{ profile: object }} props
 */
export function FamilySection({ profile }) {
  const [photoTarget, setPhotoTarget] = useState(null)
  const [previewTarget, setPreviewTarget] = useState(null)

  const familyMembers = profile.familyMembers || []
  const photos = profile.familyMemberPhotos || {}
  const canDownloadIds = profile.status === 'active' || profile.status === 'expiring-soon'

  const handleDownloadId = (familyDisplayName) => {
    if (!canDownloadIds) return

    const hasPhoto = Boolean(photos[familyDisplayName])
    if (!hasPhoto) {
      alert('Este familiar no tiene foto. Se requiere una foto para generar el ID digital.')
      return
    }

    window.open(`/api/member/family/${encodeURIComponent(familyDisplayName)}/id-card`, '_blank')
  }

  return (
    <>
      <Section title="IDs Familiares">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Los nombres son administrados por la SAC.{' '}
          <span className="inline-flex px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
            Solo lectura
          </span>
        </p>

        {!canDownloadIds && familyMembers.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            La vista previa y descarga de IDs familiares requiere membresía activa o por vencer.
          </p>
        )}

        {familyMembers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No tienes familiares registrados. Contacta a la administración para agregar nombres.
          </p>
        ) : (
          <ul className="space-y-3">
            {familyMembers.map((name) => {
              const hasPhoto = Boolean(photos[name])
              return (
                <li
                  key={name}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {name}
                    </span>
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
                    {canDownloadIds && (
                      <>
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
                          title={!hasPhoto ? 'Se requiere foto para descargar el ID' : undefined}
                          className="px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Descargar ID
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <MemberFamilyPhotoModal
        isOpen={Boolean(photoTarget)}
        onClose={() => setPhotoTarget(null)}
        profile={profile}
        familyDisplayName={photoTarget?.familyDisplayName ?? null}
      />

      <MemberFamilyIdCardPreviewModal
        isOpen={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        familyDisplayName={previewTarget?.familyDisplayName ?? null}
      />
    </>
  )
}

export default FamilySection
