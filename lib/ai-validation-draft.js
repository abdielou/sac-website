import { MAX_IMAGE_SIZE_BYTES, MAX_VALIDATION_IMAGES } from './ai-constants'
import { validateImageFiles } from './ai-validation-images'
import { validateSponsorLogo } from './social-template/eventFormHelpers'

export const VALIDATION_DRAFT_DB = 'sac-ai-validation-draft'
export const VALIDATION_DRAFT_STORE = 'draft'
export const VALIDATION_DRAFT_DB_VERSION = 2
export const VALIDATION_DRAFT_RETENTION_DAYS = 30
export const VALIDATION_DRAFT_TTL_MS = VALIDATION_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000

const LEGACY_SHARED_DRAFT_KEY = 'current'
const DRAFT_SCHEMA_VERSION = 2

export function validationDraftExpiryMs(record) {
  const explicitExpiry = Date.parse(record?.expiresAt)
  if (Number.isFinite(explicitExpiry)) return explicitExpiry
  const updatedAt = Date.parse(record?.updatedAt)
  return Number.isFinite(updatedAt) ? updatedAt + VALIDATION_DRAFT_TTL_MS : Number.NaN
}

export function isValidationDraftExpired(record, now = Date.now()) {
  const expiry = validationDraftExpiryMs(record)
  return !Number.isFinite(expiry) || expiry <= now
}

export const DEFAULT_FORM = {
  contentType: '',
  draftText: '',
  goal: '',
  intent: '',
  topic: '',
  tone: '',
  audience: '',
  cta: '',
  knownFacts: '',
  hashtags: '',
  links: '',
  imageStyle: '',
  imageConstraints: '',
  altText: '',
  eventName: '',
  eventDate: '',
  eventTime: '',
  eventLocation: '',
  eventCta: '',
  sponsorLogo: null,
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
 * @property {string} expiresAt
 * @property {boolean} repaired
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
  if (partial.sponsorLogo && typeof partial.sponsorLogo === 'object') {
    const sponsorLogo = {
      dataUrl: partial.sponsorLogo.dataUrl,
      ...(typeof partial.sponsorLogo.mimeType === 'string'
        ? { mimeType: partial.sponsorLogo.mimeType }
        : null),
      ...(typeof partial.sponsorLogo.fileName === 'string'
        ? { fileName: partial.sponsorLogo.fileName }
        : null),
    }
    if (validateSponsorLogo(sponsorLogo).ok) next.sponsorLogo = sponsorLogo
  }
  return next
}

/**
 * Identity used only in memory to notice an account change before async storage loads.
 * The email form is never used as an IndexedDB key.
 */
export function getValidationDraftUserIdentity(user) {
  const id = typeof user?.id === 'string' ? user.id.trim() : ''
  if (id) return `id:${id}`
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''
  return email ? `email:${email}` : null
}

/**
 * Resolve a stable per-user IndexedDB key. Auth user ids are already opaque. If an
 * older session lacks one, hash its normalized email instead of storing PII as a key.
 */
export async function resolveValidationDraftOwnerKey(user) {
  const id = typeof user?.id === 'string' ? user.id.trim() : ''
  if (id) return `user-id:${id}`

  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''
  if (!email || !globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') return null

  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')
    return `email-sha256:${hex}`
  } catch {
    // It is safer to disable local persistence than to expose an email in IndexedDB.
    return null
  }
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
async function filesToDraftImages(files) {
  return Promise.all((files || []).map(fileToDraftImage))
}

function isStoredArrayBuffer(value) {
  return value instanceof ArrayBuffer
}

/**
 * Revalidate files read from IndexedDB before recreating browser File objects.
 * Invalid, oversized, or excess entries are omitted rather than reaching the form.
 */
export function restoreValidationDraftImages(storedImages) {
  if (!Array.isArray(storedImages)) return { files: [], discarded: storedImages ? 1 : 0 }

  const files = []
  let discarded = 0
  for (const stored of storedImages) {
    if (files.length >= MAX_VALIDATION_IMAGES) {
      discarded += 1
      continue
    }
    if (
      !stored ||
      typeof stored !== 'object' ||
      typeof stored.name !== 'string' ||
      !stored.name.trim() ||
      stored.name.length > 255 ||
      typeof stored.type !== 'string' ||
      !isStoredArrayBuffer(stored.buffer) ||
      stored.buffer.byteLength <= 0 ||
      stored.buffer.byteLength > MAX_IMAGE_SIZE_BYTES
    ) {
      discarded += 1
      continue
    }

    try {
      const file = draftImageToFile(stored)
      if (validateImageFiles([...files, file])) {
        discarded += 1
        continue
      }
      files.push(file)
    } catch {
      discarded += 1
    }
  }
  return { files, discarded }
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
      let store
      if (!db.objectStoreNames.contains(VALIDATION_DRAFT_STORE)) {
        store = db.createObjectStore(VALIDATION_DRAFT_STORE)
      } else {
        store = request.transaction.objectStore(VALIDATION_DRAFT_STORE)
      }
      // Version 1 used one shared key for every account. Never restore it.
      store.delete(LEGACY_SHARED_DRAFT_KEY)
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
 * @param {string} ownerKey
 * @param {{ now?: number }} [options]
 * `undefined` means storage failed; `null` means there is no usable draft.
 * @returns {Promise<ValidationDraftRecord | null | undefined>}
 */
export async function readValidationDraft(ownerKey, { now = Date.now() } = {}) {
  if (!ownerKey) return null
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(VALIDATION_DRAFT_STORE, 'readonly')
      const store = tx.objectStore(VALIDATION_DRAFT_STORE)
      const record = await idbRequest(store.get(ownerKey))
      if (!record || typeof record !== 'object') return null

      const updatedAtMs = Date.parse(record.updatedAt)
      const effectiveExpiry = validationDraftExpiryMs(record)
      if (
        record.ownerKey !== ownerKey ||
        !Number.isFinite(updatedAtMs) ||
        isValidationDraftExpired(record, now)
      ) {
        // Close the readonly transaction before deleting the invalid/expired record.
        queueMicrotask(() => clearValidationDraft(ownerKey))
        return null
      }

      const formState = mergeFormState(record.formState)
      const { files, discarded } = restoreValidationDraftImages(record.images)
      const invalidSponsor = Boolean(record.formState?.sponsorLogo) && !formState.sponsorLogo
      return {
        formState,
        images: files,
        updatedAt: new Date(updatedAtMs).toISOString(),
        expiresAt: new Date(effectiveExpiry).toISOString(),
        repaired: record.schemaVersion !== DRAFT_SCHEMA_VERSION || discarded > 0 || invalidSponsor,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    console.warn('ai-validation-draft: failed to read draft', error)
    return undefined
  }
}

/**
 * @param {string} ownerKey
 * @param {{ formState: typeof DEFAULT_FORM, images: File[] }} draft
 * @param {{ now?: number }} [options]
 * @returns {Promise<{ updatedAt: string, expiresAt: string } | null>}
 */
export async function writeValidationDraft(
  ownerKey,
  { formState, images },
  { now = Date.now() } = {}
) {
  if (!ownerKey || !Number.isFinite(now) || !Array.isArray(images) || validateImageFiles(images)) {
    return null
  }
  try {
    const storedImages = await filesToDraftImages(images)
    const updatedAt = new Date(now).toISOString()
    const expiresAt = new Date(now + VALIDATION_DRAFT_TTL_MS).toISOString()
    const record = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      ownerKey,
      formState: mergeFormState(formState),
      images: storedImages,
      updatedAt,
      expiresAt,
    }
    const db = await openDb()
    try {
      const tx = db.transaction(VALIDATION_DRAFT_STORE, 'readwrite')
      const store = tx.objectStore(VALIDATION_DRAFT_STORE)
      await idbRequest(store.put(record, ownerKey))
      return { updatedAt, expiresAt }
    } finally {
      db.close()
    }
  } catch (error) {
    console.warn('ai-validation-draft: failed to write draft', error)
    return null
  }
}

/**
 * @param {string} ownerKey
 * @returns {Promise<boolean>}
 */
export async function clearValidationDraft(ownerKey) {
  if (!ownerKey) return false
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(VALIDATION_DRAFT_STORE, 'readwrite')
      const store = tx.objectStore(VALIDATION_DRAFT_STORE)
      await idbRequest(store.delete(ownerKey))
      return true
    } finally {
      db.close()
    }
  } catch (error) {
    console.warn('ai-validation-draft: failed to clear draft', error)
    return false
  }
}
