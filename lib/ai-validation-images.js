import { MAX_IMAGE_SIZE_BYTES, MAX_VALIDATION_IMAGES } from './ai-constants'

export const VALIDATION_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
export const MAX_VALIDATION_IMAGE_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_SIZE_BYTES * 4) / 3) + 128

function normalizeMimeType(value) {
  const mimeType = String(value || '')
    .trim()
    .toLowerCase()
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
}

function decodedBase64Bytes(base64) {
  const padding = (base64.match(/=+$/) || [''])[0].length
  return Math.floor((base64.length * 3) / 4) - padding
}

export function validateSerializedValidationImage(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    return { ok: false, error: 'Cada imagen debe ser un objeto válido.' }
  }

  const dataUrl = typeof image.dataUrl === 'string' ? image.dataUrl.trim() : ''
  if (!dataUrl || dataUrl.length > MAX_VALIDATION_IMAGE_DATA_URL_LENGTH) {
    return { ok: false, error: 'La imagen excede el tamaño máximo permitido.' }
  }
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i
  )
  if (!match || !match[2] || match[2].length % 4 !== 0) {
    return { ok: false, error: 'La imagen debe usar un data URL base64 válido.' }
  }

  const headerMime = normalizeMimeType(match[1])
  const declaredMime = normalizeMimeType(image.mimeType)
  if (
    !VALIDATION_IMAGE_MIME_TYPES.map(normalizeMimeType).includes(headerMime) ||
    headerMime !== declaredMime
  ) {
    return { ok: false, error: 'El tipo declarado no coincide con la imagen.' }
  }

  const size = decodedBase64Bytes(match[2])
  if (size <= 0 || size > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, error: 'Cada imagen debe ser menor a 5 MB.' }
  }
  if (image.size != null && (!Number.isInteger(image.size) || image.size !== size)) {
    return { ok: false, error: 'El tamaño declarado no coincide con la imagen.' }
  }
  if (
    image.fileName != null &&
    (typeof image.fileName !== 'string' || image.fileName.length > 255)
  ) {
    return { ok: false, error: 'El nombre de la imagen es inválido.' }
  }

  return {
    ok: true,
    image: {
      dataUrl,
      mimeType: headerMime,
      ...(image.fileName?.trim() ? { fileName: image.fileName.trim() } : null),
      size,
    },
  }
}

export function normalizeSerializedValidationImages(images) {
  if (!Array.isArray(images)) return { ok: false, error: 'images debe ser una lista.' }
  if (images.length > MAX_VALIDATION_IMAGES) {
    return { ok: false, error: `Máximo ${MAX_VALIDATION_IMAGES} imágenes.` }
  }
  const normalized = []
  for (const image of images) {
    const validation = validateSerializedValidationImage(image)
    if (!validation.ok) return validation
    normalized.push(validation.image)
  }
  return { ok: true, images: normalized }
}

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
    const mimeType = String(file.type || '').toLowerCase()
    if (!mimeType.startsWith('image/')) {
      return 'Solo se permiten archivos de imagen.'
    }
    if (!VALIDATION_IMAGE_MIME_TYPES.includes(mimeType)) {
      return 'Solo se permiten imágenes PNG, JPEG o WebP.'
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
