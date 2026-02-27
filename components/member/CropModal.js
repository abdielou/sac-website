'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

/**
 * Extract a cropped region from an image source and return it as a JPEG Blob.
 * Uses an offscreen canvas to draw only the cropped pixel area.
 *
 * @param {string} imageSrc - Data URL or object URL of the source image
 * @param {{ x: number, y: number, width: number, height: number }} pixelCrop - Crop area in pixels
 * @returns {Promise<Blob>} Cropped JPEG blob at 85% quality
 */
function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      const ctx = canvas.getContext('2d')

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      )

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Error al recortar imagen'))
          }
        },
        'image/jpeg',
        0.85
      )
    }
    image.onerror = () => reject(new Error('Error al cargar imagen'))
    image.src = imageSrc
  })
}

/**
 * Modal overlay with react-easy-crop for selecting and confirming a crop area.
 * Renders a fullscreen overlay with the cropper, zoom slider, and confirm/cancel buttons.
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether the modal is visible
 * @param {string} props.imageSrc - Data URL or object URL of the image to crop
 * @param {(blob: Blob) => void} props.onConfirm - Called with cropped JPEG blob on confirm
 * @param {() => void} props.onCancel - Called when user cancels
 * @param {number} [props.aspect=1] - Aspect ratio (1 = square)
 */
export function CropModal({ open, imageSrc, onConfirm, onCancel, aspect = 1 }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels || !imageSrc) return
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
      onConfirm(blob)
    } catch (err) {
      console.error('Crop error:', err)
    }
  }, [croppedAreaPixels, imageSrc, onConfirm])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Crop area */}
        <div className="relative w-full" style={{ height: '400px' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            cropShape="round"
            showGrid={false}
          />
        </div>

        {/* Controls */}
        <div className="p-4 space-y-4">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="crop-zoom"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
            >
              Zoom
            </label>
            <input
              id="crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CropModal
