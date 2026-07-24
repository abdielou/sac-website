import { CONTENT_TYPE_LABELS, CONTENT_TYPES, PLATFORM_LABELS, PLATFORMS } from './ai-constants'
import { getDefaultGuidelines } from './ai-guidelines'

export const STORAGE_KEYS = {
  active: 'sac-ai-guidelines-active',
  draft: 'sac-ai-guidelines-draft',
  audit: 'sac-ai-guidelines-audit',
}

/**
 * @typedef {'created_draft' | 'saved' | 'activated' | 'rollback' | 'discarded_draft'} AuditAction
 */

/**
 * @typedef {Object} GuidelineDocument
 * @property {string} version
 * @property {string} [updatedAt]
 * @property {string} [updatedBy]
 * @property {string} global
 * @property {Record<string, string>} platforms
 * @property {Record<string, string>} platformLabels
 * @property {string} prohibited
 * @property {string} imageValidation
 * @property {Record<string, string>} contentTypes
 */

/**
 * @typedef {Object} PlatformEntry
 * @property {string} id
 * @property {string} label
 * @property {string} rules
 */

/**
 * @typedef {Object} AuditEvent
 * @property {string} id
 * @property {AuditAction} action
 * @property {string} version
 * @property {string} at
 * @property {string} by
 * @property {string} [detail]
 */

export function cloneGuidelines(doc) {
  return JSON.parse(JSON.stringify(doc))
}

export function createGuidelineDocument({ version, updatedAt, updatedBy, seed } = {}) {
  const base = normalizeGuidelineDocument(cloneGuidelines(seed || getDefaultGuidelines()))
  return {
    ...base,
    version: version || base.version,
    ...(updatedAt ? { updatedAt } : {}),
    ...(updatedBy ? { updatedBy } : {}),
  }
}

export function bumpLocalVersion(currentVersion) {
  const match = String(currentVersion || '').match(/^local-v(\d+)$/)
  if (match) {
    return `local-v${parseInt(match[1], 10) + 1}`
  }
  return 'local-v2'
}

export function createAuditEvent({ action, version, by, detail }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    version,
    at: new Date().toISOString(),
    by,
    ...(detail ? { detail } : {}),
  }
}

/**
 * Promote draft to active: new version, timestamps, clear draft.
 * @returns {{ active: GuidelineDocument, auditEvent: AuditEvent }}
 */
export function activateDraft(draft, activatedBy) {
  const nextVersion = bumpLocalVersion(draft.version)
  const active = {
    ...normalizeGuidelineDocument(cloneGuidelines(draft)),
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    updatedBy: activatedBy,
  }
  const auditEvent = createAuditEvent({
    action: 'activated',
    version: nextVersion,
    by: activatedBy,
    detail: `Versión ${nextVersion} activada`,
  })
  return { active, auditEvent }
}

export function prependAuditEvent(events, event, max = 50) {
  return [event, ...(Array.isArray(events) ? events : [])].slice(0, max)
}

export function parseStoredJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

/**
 * Slugify a free-form platform name. When `existingIds` is provided, appends
 * numeric suffixes on collision (`threads`, `threads-2`, …).
 * @param {string} name
 * @param {Iterable<string>} [existingIds]
 */
export function slugifyPlatformId(name, existingIds = []) {
  const taken = new Set(existingIds)
  const base =
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'platform'

  if (!taken.has(base)) return base

  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/**
 * Ensure platformLabels exists for every platforms key (migrates legacy docs).
 * @param {GuidelineDocument|null|undefined} doc
 * @returns {GuidelineDocument|null}
 */
export function normalizeGuidelineDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc || null
  const platforms = doc.platforms && typeof doc.platforms === 'object' ? { ...doc.platforms } : {}
  const existingLabels =
    doc.platformLabels && typeof doc.platformLabels === 'object' ? { ...doc.platformLabels } : {}
  const platformLabels = { ...existingLabels }

  for (const id of Object.keys(platforms)) {
    if (!platformLabels[id]) {
      platformLabels[id] = PLATFORM_LABELS[id] || id
    }
  }

  for (const id of Object.keys(platformLabels)) {
    if (!(id in platforms)) {
      delete platformLabels[id]
    }
  }

  return {
    ...doc,
    platforms,
    platformLabels,
  }
}

/**
 * @param {GuidelineDocument|null|undefined} doc
 * @returns {PlatformEntry[]}
 */
export function listPlatformEntries(doc) {
  const normalized = normalizeGuidelineDocument(doc)
  if (!normalized) return []
  return Object.keys(normalized.platforms).map((id) => ({
    id,
    label: normalized.platformLabels[id] || PLATFORM_LABELS[id] || id,
    rules: normalized.platforms[id] || '',
  }))
}

/**
 * @typedef {Object} ContentTypeEntry
 * @property {string} id
 * @property {string} label
 * @property {string} rules
 */

/**
 * @param {GuidelineDocument|null|undefined} doc
 * @returns {ContentTypeEntry[]}
 */
export function listContentTypeEntries(doc) {
  const normalized = normalizeGuidelineDocument(doc)
  if (!normalized?.contentTypes || typeof normalized.contentTypes !== 'object') return []
  return Object.keys(normalized.contentTypes).map((id) => ({
    id,
    label: CONTENT_TYPE_LABELS[id] || id,
    rules: normalized.contentTypes[id] || '',
  }))
}

/**
 * Platform options for form selectors: active guidelines first, MVP defaults fallback.
 * When `generationOnly` is true, intersect with workflow-supported PLATFORMS.
 * @param {GuidelineDocument|null|undefined} doc
 * @param {{ generationOnly?: boolean }} [options]
 * @returns {{ id: string, label: string }[]}
 */
export function resolvePlatformOptions(doc, { generationOnly = false } = {}) {
  const fromDoc = listPlatformEntries(doc).map(({ id, label }) => ({ id, label }))
  let options = fromDoc.length
    ? fromDoc
    : PLATFORMS.map((id) => ({ id, label: PLATFORM_LABELS[id] || id }))

  if (generationOnly) {
    const allowed = new Set(PLATFORMS)
    options = options.filter((entry) => allowed.has(entry.id))
    if (!options.length) {
      options = PLATFORMS.map((id) => ({ id, label: PLATFORM_LABELS[id] || id }))
    }
  }

  return options
}

/**
 * Content-type options for form selectors: active guidelines first, MVP defaults
 * merged in so known workflow types remain available even on older seeds.
 * @param {GuidelineDocument|null|undefined} doc
 * @returns {{ id: string, label: string }[]}
 */
export function resolveContentTypeOptions(doc) {
  const fromDoc = listContentTypeEntries(doc)
  const byId = new Map(fromDoc.map((entry) => [entry.id, entry]))
  const ids = fromDoc.map((entry) => entry.id)

  for (const id of CONTENT_TYPES) {
    if (!byId.has(id)) ids.push(id)
  }

  if (!ids.length) {
    return CONTENT_TYPES.map((id) => ({ id, label: CONTENT_TYPE_LABELS[id] || id }))
  }

  return ids.map((id) => ({
    id,
    label: byId.get(id)?.label || CONTENT_TYPE_LABELS[id] || id,
  }))
}

/**
 * Sync preview of which rules apply for a sample platform/content type.
 * Used by the Guidelines management UI (does not hit S3).
 */
export function previewGuidelinesAgainstDocument(
  doc,
  { platform, contentType, mode = 'validation' } = {}
) {
  const active = normalizeGuidelineDocument(doc) || getDefaultGuidelines()
  const platformKey = String(platform || '').toLowerCase()
  const contentTypeLabel = CONTENT_TYPE_LABELS[contentType] || contentType || '—'

  if (mode === 'generation') {
    const generation = active.generation || {
      global: active.global,
      platforms: {},
      contentTypes: {},
      imagePrompt: '',
    }
    return {
      version: active.version,
      mode: 'generation',
      global: generation.global || active.global,
      platform:
        generation.platforms?.[platformKey] || 'Reglas generales de redacción para la plataforma.',
      contentType:
        generation.contentTypes?.[contentType] ||
        `Tipo de contenido: ${contentTypeLabel}. Redactar fiel a los datos provistos, sin inventar detalles.`,
      prohibited: active.prohibited,
      imagePrompt: generation.imagePrompt || '',
      imageValidation: active.imageValidation,
    }
  }

  return {
    version: active.version,
    mode: 'validation',
    global: active.global,
    platform: active.platforms?.[platformKey] || 'Reglas generales de plataforma.',
    contentType:
      active.contentTypes?.[contentType] ||
      `Tipo de contenido: ${contentTypeLabel}. Aplica reglas mínimas de completitud según el tipo.`,
    prohibited: active.prohibited,
    imageValidation: active.imageValidation,
  }
}

/**
 * @param {GuidelineDocument} doc
 * @param {string} label
 * @returns {GuidelineDocument}
 */
export function addPlatform(doc, label) {
  const normalized = normalizeGuidelineDocument(cloneGuidelines(doc))
  const trimmed = String(label || '').trim()
  if (!trimmed) {
    throw new Error('El nombre de la plataforma es obligatorio.')
  }
  const id = slugifyPlatformId(trimmed, Object.keys(normalized.platforms))
  return {
    ...normalized,
    platforms: {
      ...normalized.platforms,
      [id]: '',
    },
    platformLabels: {
      ...normalized.platformLabels,
      [id]: trimmed,
    },
  }
}

/**
 * @param {GuidelineDocument} doc
 * @param {string} id
 * @returns {GuidelineDocument}
 */
export function removePlatform(doc, id) {
  const normalized = normalizeGuidelineDocument(cloneGuidelines(doc))
  const keys = Object.keys(normalized.platforms)
  if (keys.length <= 1) {
    throw new Error('Debe quedar al menos una plataforma.')
  }
  if (!(id in normalized.platforms)) {
    return normalized
  }
  const { [id]: _removedRules, ...platforms } = normalized.platforms
  const { [id]: _removedLabel, ...platformLabels } = normalized.platformLabels
  return {
    ...normalized,
    platforms,
    platformLabels,
  }
}
