'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { CropModal } from './CropModal'

/**
 * Default avatar SVG as inline data URL.
 * Renders a generic person silhouette in a circle.
 */
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Ccircle cx='64' cy='64' r='64' fill='%23e5e7eb'/%3E%3Ccircle cx='64' cy='48' r='22' fill='%239ca3af'/%3E%3Cellipse cx='64' cy='100' rx='36' ry='24' fill='%239ca3af'/%3E%3C/svg%3E"

/**
 * Photo upload component with device file picker and camera capture.
 * Displays circular photo preview and opens CropModal for cropping.
 *
 * @param {Object} props
 * @param {string|null} props.currentPhotoUrl - Current saved photo URL from profile
 * @param {string|null} props.stagedPhotoUrl - Preview URL of newly cropped (unsaved) photo
 * @param {(blob: Blob, previewUrl: string) => void} props.onPhotoCropped - Called after crop confirms
 * @param {boolean} props.disabled - Disable buttons during save
 */
export function PhotoUpload({ currentPhotoUrl, stagedPhotoUrl, onPhotoCropped, disabled }) {
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [rawImageSrc, setRawImageSrc] = useState(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const objectUrlRef = useRef(null)

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setRawImageSrc(reader.result)
      setCropModalOpen(true)
    }
    reader.readAsDataURL(file)

    // Reset input so same file can be selected again
    e.target.value = ''
  }, [])

  const handleCropConfirm = useCallback(
    (blob) => {
      // Revoke previous preview URL if any
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }

      const previewUrl = URL.createObjectURL(blob)
      objectUrlRef.current = previewUrl

      onPhotoCropped(blob, previewUrl)
      setCropModalOpen(false)
      setRawImageSrc(null)
    },
    [onPhotoCropped]
  )

  const handleCropCancel = useCallback(() => {
    setCropModalOpen(false)
    setRawImageSrc(null)
  }, [])

  const displayUrl = stagedPhotoUrl || currentPhotoUrl || DEFAULT_AVATAR

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Circular photo preview */}
      <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700">
        <img
          src={displayUrl}
          alt="Foto de perfil"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Upload buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Subir foto
        </button>
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Tomar foto
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
        aria-label="Seleccionar foto desde dispositivo"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileSelected}
        className="hidden"
        aria-label="Tomar foto con camara"
      />

      {/* Crop Modal */}
      <CropModal
        open={cropModalOpen}
        imageSrc={rawImageSrc}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    </div>
  )
}

export default PhotoUpload
