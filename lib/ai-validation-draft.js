export const VALIDATION_DRAFT_DB = 'sac-ai-validation-draft'
export const VALIDATION_DRAFT_STORE = 'draft'
export const VALIDATION_DRAFT_KEY = 'current'
export const VALIDATION_DRAFT_DB_VERSION = 1

export const DEFAULT_FORM = {
  platform: 'instagram',
  contentType: 'regular_post',
  draftText: '',
  goal: '',
  audience: '',
  cta: '',
  hashtags: '',
  altText: '',
  eventName: '',
  eventDate: '',
  eventTime: '',
  eventLocation: '',
}

/**
 * @typedef {Object} StoredDraftImage
 * @property {string} name
 * @property {string} type
 * @property {number} lastModified
 * @property {ArrayBuffer} buffer
 */

/**
 * @typedef {Object} ValidationDraftRecord
 * @property {typeof DEFAULT_FORM} formState
 * @property {StoredDraftImage[]} images
 * @property {string} updatedAt
 */

/**
 * @param {unknown} partial
 * @returns {typeof DEFAULT_FORM}
 */
export function mergeFormState(partial) {
  if (!partial || typeof partial !== 'object') return { ...DEFAULT_FORM }
  const next = { ...DEFAULT_FORM }
  for (const key of Object.keys(DEFAULT_FORM)) {
    if (typeof partial[key] === 'string') next[key] = partial[key]
  }
  return next
}

/**
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * @param {File} file
 * @returns {Promise<StoredDraftImage>}
 */
export async function fileToDraftImage(file) {
  const buffer = await blobToArrayBuffer(file)
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
    buffer,
  }
}

/**
 * @param {StoredDraftImage} stored
 * @returns {File}
 */
export function draftImageToFile(stored) {
  return new File([stored.buffer], stored.name || 'image', {
    type: stored.type || 'application/octet-stream',
    lastModified: stored.lastModified || Date.now(),
  })
}

/**
 * @param {File[]} files
 * @returns {Promise<StoredDraftImage[]>}
 */
export async function filesToDraftImages(files) {
  return Promise.all((files || []).map(fileToDraftImage))
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(VALIDATION_DRAFT_DB, VALIDATION_DRAFT_DB_VERSION)
    request.onerror = () => reject(request.error || new Error('Failed to open validation draft DB'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(VALIDATION_DRAFT_STORE)) {
        db.createObjectStore(VALIDATION_DRAFT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * @returns {Promise<ValidationDraftRecord | null>}
 */
export async function readValidationDraft() {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(VALIDATION_DRAFT_STORE, 'readonly')
      const store = tx.objectStore(VALIDATION_DRAFT_STORE)
      const record = await idbRequest(store.get(VALIDATION_DRAFT_KEY))
      if (!record || typeof record !== 'object') return null
      return {
        formState: mergeFormState(record.formState),
        images: Array.isArray(record.images) ? record.images : [],
        updatedAt: record.updatedAt || null,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.warn('ai-validation-draft: failed to read draft', error)
    return null
  }
}

/**
 * @param {{ formState: typeof DEFAULT_FORM, images: File[] }} draft
 * @returns {Promise<boolean>}
 */
export async function writeValidationDraft({ formState, images }) {
  try {
    const storedImages = await filesToDraftImages(images)
    const record = {
      formState: mergeFormState(formState),
      images: storedImages,
      updatedAt: new Date().toISOString(),
    }
    const db = await openDb()
    try {
      const tx = db.transaction(VALIDATION_DRAFT_STORE, 'readwrite')
      const store = tx.objectStore(VALIDATION_DRAFT_STORE)
      await idbRequest(store.put(record, VALIDATION_DRAFT_KEY))
      return true
    } finally {
      db.close()
    }
  } catch (error) {
    console.warn('ai-validation-draft: failed to write draft', error)
    return false
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function clearValidationDraft() {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(VALIDATION_DRAFT_STORE, 'readwrite')
      const store = tx.objectStore(VALIDATION_DRAFT_STORE)
      await idbRequest(store.delete(VALIDATION_DRAFT_KEY))
      return true
    } finally {
      db.close()
    }
  } catch (error) {
    console.warn('ai-validation-draft: failed to clear draft', error)
    return false
  }
}
