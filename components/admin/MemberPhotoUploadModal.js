'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PhotoUpload } from '@/components/member/PhotoUpload'
import { useUploadMemberPhoto } from '@/lib/hooks/useAdminData'

/**
 * Modal for admins to upload or re-crop a member profile photo.
 * Reuses PhotoUpload with camera disabled; saves immediately after crop.
 *
 * @param {{ isOpen: boolean, onClose: () => void, member: { email: string, name?: string, photoFileId?: string } | null }} props
 */
export function MemberPhotoUploadModal({ isOpen, onClose, member }) {
  const { mutate, isPending, error, reset: resetMutation } = useUploadMemberPhoto()
  const [stagedPhotoPreview, setStagedPhotoPreview] = useState(null)
  const previewUrlRef = useRef(null)

  useEffect(() => {
    if (isOpen && member) {
      resetMutation()
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setStagedPhotoPreview(null)
    }
  }, [isOpen, member, resetMutation])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const currentPhotoUrl =
    member?.photoFileId && member?.email
      ? `/api/member/photo/${encodeURIComponent(member.email)}?photoFileId=${encodeURIComponent(member.photoFileId)}`
      : null

  const handlePhotoCropped = (blob, previewUrl) => {
    if (!member?.email) return

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    previewUrlRef.current = previewUrl
    setStagedPhotoPreview(previewUrl)

    mutate(
      { email: member.email, photo: blob },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  if (!isOpen || !member) return null

  const title = `Foto de perfil — ${member.name || member.email}`

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
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
          {member.name && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
          )}

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

export default MemberPhotoUploadModal
