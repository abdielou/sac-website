import {
  CONTENT_TYPE_LABELS,
  DEFAULT_SEED_PLATFORM_LABELS,
  DEFAULT_SEED_PLATFORMS,
  MAX_GUIDELINE_PLATFORMS,
} from './ai-constants'
import { getDefaultGuidelines, resolveGenerationGuidelinesFromDocument } from './ai-guidelines'
import {
  GUIDELINES_SCHEMA_VERSION,
  listContentTypeDefinitions,
  normalizeGuidelineDocumentV3,
  resolveContentTypeDefinition,
} from './ai-guidelines-schema'

/**
 * @typedef {'created_draft' | 'saved' | 'activated' | 'rollback' | 'discarded_draft' | 'created_content_type' | 'archived_content_type' | 'removed_content_type'} AuditAction
 */

/**
 * @typedef {Object} GuidelineDocument
 * @property {string} version
 * @property {string} [updatedAt]
 * @property {string} [updatedBy]
 * @property {string} global
 * @property {Record<string, string>} platforms canonical expectations used to create and review content
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
 * Ensure platformLabels exists for every platforms key.
 * @param {GuidelineDocument|null|undefined} doc
 * @returns {GuidelineDocument|null}
 */
export function normalizeGuidelineDocument(doc) {
  return normalizeGuidelineDocumentV3(doc)
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
    label: normalized.platformLabels[id] || DEFAULT_SEED_PLATFORM_LABELS[id] || id,
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
  return listContentTypeDefinitions(normalized, { includeArchived: true }).map((entry) => ({
    ...entry,
    rules: entry.validation?.rules || '',
  }))
}

/**
 * Platform options for form selectors: active guidelines first, seed defaults fallback.
 * @param {GuidelineDocument|null|undefined} doc
 * @param {{ generationOnly?: boolean }} [options] generationOnly is retained for callers; options are the document platforms.
 * @returns {{ id: string, label: string }[]}
 */
export function resolvePlatformOptions(doc, { generationOnly: _generationOnly = false } = {}) {
  const hasAuthoritativePlatforms =
    doc?.schemaVersion === GUIDELINES_SCHEMA_VERSION && Array.isArray(doc?.contentTypeCatalog)
  const fromDoc = listPlatformEntries(doc).map(({ id, label }) => ({ id, label }))
  if (fromDoc.length) return fromDoc
  if (hasAuthoritativePlatforms) return []
  return DEFAULT_SEED_PLATFORMS.map((id) => ({
    id,
    label: DEFAULT_SEED_PLATFORM_LABELS[id] || id,
  }))
}

/**
 * Content-type options for form selectors in canonical generator order, followed by
 * any custom types present in active guidelines.
 * @param {GuidelineDocument|null|undefined} doc
 * @returns {{ id: string, label: string }[]}
 */
export function resolveContentTypeOptions(doc, { includeDefinitions = false } = {}) {
  const normalized = normalizeGuidelineDocument(doc || getDefaultGuidelines())
  return listContentTypeDefinitions(normalized).map((entry) => ({
    id: entry.id,
    label: entry.label || CONTENT_TYPE_LABELS[entry.id] || entry.id,
    ...(includeDefinitions ? { definition: entry } : null),
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
  const definition = resolveContentTypeDefinition(active, contentType, { includeArchived: true })
  const contentTypeLabel =
    definition?.label || CONTENT_TYPE_LABELS[contentType] || contentType || '—'

  if (mode === 'generation') {
    return {
      ...resolveGenerationGuidelinesFromDocument(active, {
        platform: platformKey,
        contentType,
      }),
      mode: 'generation',
    }
  }

  return {
    version: active.version,
    mode: 'validation',
    global: active.global,
    platform: active.platforms?.[platformKey] || 'Expectativas generales de plataforma.',
    captionMaxCharacters: active.platformConstraints?.[platformKey]?.captionMaxCharacters ?? null,
    contentType:
      definition?.validation?.rules ||
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
  const existingIds = Object.keys(normalized.platforms)
  if (existingIds.length >= MAX_GUIDELINE_PLATFORMS) {
    throw new Error(`Como máximo se admiten ${MAX_GUIDELINE_PLATFORMS} plataformas.`)
  }
  const id = slugifyPlatformId(trimmed, existingIds)
  const generation = normalized.generation || {}
  const expectation = `Describe el contenido esperado para ${trimmed}.`

  const contentTypeCatalog = Array.isArray(normalized.contentTypeCatalog)
    ? normalized.contentTypeCatalog.map((entry) => {
        const visual =
          entry?.visual && typeof entry.visual === 'object' ? { ...entry.visual } : null
        if (!visual) return entry
        const imagePolicyByPlatform = {
          ...(visual.imagePolicyByPlatform || {}),
        }
        if (!Object.prototype.hasOwnProperty.call(imagePolicyByPlatform, id)) {
          imagePolicyByPlatform[id] = visual.mode === 'none' ? 'prohibited' : 'optional'
        }
        const scopedPlatforms = Array.isArray(entry.platforms) ? entry.platforms : existingIds
        const includeInScope = id !== 'instagram' || visual.mode !== 'none'
        const platforms = includeInScope
          ? [...new Set([...scopedPlatforms, id])]
          : [...scopedPlatforms]
        if (platforms.includes('instagram')) {
          for (const platform of platforms) imagePolicyByPlatform[platform] = 'required'
        }
        return {
          ...entry,
          platforms,
          visual: { ...visual, imagePolicyByPlatform },
        }
      })
    : normalized.contentTypeCatalog

  return {
    ...normalized,
    platforms: {
      ...normalized.platforms,
      [id]: expectation,
    },
    platformLabels: {
      ...normalized.platformLabels,
      [id]: trimmed,
    },
    platformConstraints: {
      ...(normalized.platformConstraints || {}),
      [id]: { captionMaxCharacters: null },
    },
    generation: {
      ...generation,
    },
    contentTypeCatalog,
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
  const { [id]: _removedConstraints, ...platformConstraints } = normalized.platformConstraints || {}
  const generation = normalized.generation || {}
  const remainingPlatformIds = Object.keys(platforms)
  const contentTypeCatalog = Array.isArray(normalized.contentTypeCatalog)
    ? normalized.contentTypeCatalog.map((entry) => {
        const visual =
          entry?.visual && typeof entry.visual === 'object' ? { ...entry.visual } : null
        if (!visual?.imagePolicyByPlatform) return entry
        const { [id]: _removedPolicy, ...imagePolicyByPlatform } = visual.imagePolicyByPlatform
        let scopedPlatforms = (entry.platforms || []).filter((platform) => platform !== id)
        if (!scopedPlatforms.length) {
          scopedPlatforms = [
            visual.mode === 'none'
              ? remainingPlatformIds.find((platform) => platform !== 'instagram') ||
                remainingPlatformIds[0]
              : remainingPlatformIds[0],
          ].filter(Boolean)
        }
        if (scopedPlatforms.includes('instagram')) {
          for (const platform of scopedPlatforms) imagePolicyByPlatform[platform] = 'required'
        }
        const mustEnableImage = visual.mode === 'none' && scopedPlatforms.includes('instagram')
        return {
          ...entry,
          platforms: scopedPlatforms,
          visual: mustEnableImage
            ? {
                ...visual,
                mode: 'template',
                template: 'simple',
                backgroundSources: ['stock'],
                imagePolicyByPlatform,
              }
            : { ...visual, imagePolicyByPlatform },
        }
      })
    : normalized.contentTypeCatalog

  return {
    ...normalized,
    platforms,
    platformLabels,
    platformConstraints,
    generation: {
      ...generation,
    },
    contentTypeCatalog,
  }
}
