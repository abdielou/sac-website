'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PhotoUpload } from '@/components/member/PhotoUpload'
import { useUploadMemberFamilyPhoto } from '@/lib/hooks/useMemberProfile'

/**
 * Modal for members to upload or re-crop a family member photo.
 *
 * @param {{ isOpen: boolean, onClose: () => void, profile: object | null, familyDisplayName: string | null }} props
 */
export function MemberFamilyPhotoModal({ isOpen, onClose, profile, familyDisplayName }) {
  const { mutate, isPending, error, reset: resetMutation } = useUploadMemberFamilyPhoto()
  const [stagedPhotoPreview, setStagedPhotoPreview] = useState(null)
  const previewUrlRef = useRef(null)

  useEffect(() => {
    if (isOpen && profile && familyDisplayName) {
      resetMutation()
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setStagedPhotoPreview(null)
    }
  }, [isOpen, profile, familyDisplayName, resetMutation])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const photoFileId = familyDisplayName ? profile?.familyMemberPhotos?.[familyDisplayName] : null

  const photoEmail = profile?.sacEmail || profile?.email

  const currentPhotoUrl =
    photoFileId && photoEmail && familyDisplayName
      ? `/api/member/photo/${encodeURIComponent(photoEmail)}/family/${encodeURIComponent(familyDisplayName)}?photoFileId=${encodeURIComponent(photoFileId)}`
      : null

  const handlePhotoCropped = (blob, previewUrl) => {
    if (!familyDisplayName) return

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    previewUrlRef.current = previewUrl
    setStagedPhotoPreview(previewUrl)

    mutate(
      { familyDisplayName, photo: blob },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  if (!isOpen || !profile || !familyDisplayName) return null

  const title = `Foto — ${familyDisplayName}`

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
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

        <div className="px-6 py-6 flex flex-col items-center gap-4">
          <PhotoUpload
            currentPhotoUrl={currentPhotoUrl}
            stagedPhotoUrl={stagedPhotoPreview}
            onPhotoCropped={handlePhotoCropped}
            disabled={isPending}
            allowCamera={false}
          />

          {isPending && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Guardando foto...</p>
          )}

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">
              {error.message || 'Error al subir foto'}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default MemberFamilyPhotoModal
