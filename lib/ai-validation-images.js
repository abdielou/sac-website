import { MAX_IMAGE_SIZE_BYTES, MAX_VALIDATION_IMAGES } from '@/lib/ai-constants'

/**
 * Validate a proposed list of image files for the AI validation form.
 * @param {File[]} files
 * @returns {string|null} error message, or null if valid
 */
export function validateImageFiles(files) {
  if (files.length > MAX_VALIDATION_IMAGES) {
    return `Máximo ${MAX_VALIDATION_IMAGES} imágenes.`
  }
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return `Cada imagen debe ser menor a ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`
    }
    if (file.type && !file.type.startsWith('image/')) {
      return 'Solo se permiten archivos de imagen.'
    }
  }
  return null
}

/**
 * Merge newly selected files onto the current selection, validating the full set.
 * On failure, returns the previous images unchanged with an error message.
 * @param {File[]} currentImages
 * @param {File[]} incomingFiles
 * @returns {{ images: File[], error: string|null }}
 */
export function mergeValidationImages(currentImages, incomingFiles) {
  const next = [...currentImages, ...incomingFiles]
  const error = validateImageFiles(next)
  if (error) {
    return { images: currentImages, error }
  }
  return { images: next, error: null }
}
