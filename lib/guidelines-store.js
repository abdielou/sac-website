import AWS from 'aws-sdk'
import { getDefaultGuidelines } from './ai-guidelines'
import {
  cloneGuidelines,
  createAuditEvent,
  normalizeGuidelineDocument,
  prependAuditEvent,
} from './ai-guidelines-draft'

let s3Client = null

function getGuidelinesS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

const getBucket = () => process.env.S3_ARTICLES_BUCKET_NAME

const KEYS = {
  meta: 'guidelines/meta.json',
  audit: 'guidelines/audit.json',
  draft: (id) => `guidelines/drafts/${id}.json`,
  version: (version) => `guidelines/versions/${encodeURIComponent(version)}.json`,
}

const MAX_AUDIT = 100

/**
 * @typedef {Object} GuidelinesMeta
 * @property {string|null} activeVersion
 * @property {{ id: string, basedOn: string, updatedAt: string, updatedBy: string }|null} draft
 * @property {Array<{ version: string, activatedAt: string, activatedBy: string }>} versions
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} GuidelineDraftRecord
 * @property {string} id
 * @property {string} basedOn
 * @property {object} document
 * @property {string} updatedAt
 * @property {string} updatedBy
 */

function emptyMeta() {
  return {
    activeVersion: null,
    draft: null,
    versions: [],
    updatedAt: null,
  }
}

function isNotFoundError(error) {
  return error?.code === 'NoSuchKey' || error?.statusCode === 404
}

async function getJson(key) {
  const bucket = getBucket()
  if (!bucket) return null

  try {
    const s3 = getGuidelinesS3Client()
    const result = await s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (isNotFoundError(error)) return null
    console.error('guidelines-store: failed to read', key, error)
    throw new Error(`Failed to read guidelines object: ${key}`)
  }
}

async function putJson(key, data) {
  const bucket = getBucket()
  if (!bucket) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  const s3 = getGuidelinesS3Client()
  await s3
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    })
    .promise()
}

/**
 * Best-effort delete. Activate/discard must not fail if the IAM role lacks
 * s3:DeleteObject — clearing the meta pointer is enough for correctness.
 */
async function deleteJson(key) {
  const bucket = getBucket()
  if (!bucket) return false

  try {
    const s3 = getGuidelinesS3Client()
    await s3
      .deleteObject({
        Bucket: bucket,
        Key: key,
      })
      .promise()
    return true
  } catch (error) {
    console.warn(
      'guidelines-store: failed to delete (continuing; meta pointer is source of truth)',
      key,
      error?.code || error?.message || error
    )
    return false
  }
}

export function validateGuidelineDocument(doc) {
  const errors = []
  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: ['Documento de guías inválido.'] }
  }

  if (typeof doc.global !== 'string' || !doc.global.trim()) {
    errors.push('La voz de marca (global) es obligatoria.')
  }
  if (typeof doc.prohibited !== 'string' || !doc.prohibited.trim()) {
    errors.push('El contenido prohibido es obligatorio.')
  }
  if (typeof doc.imageValidation !== 'string' || !doc.imageValidation.trim()) {
    errors.push('Las reglas de validación de imágenes son obligatorias.')
  }
  if (!doc.platforms || typeof doc.platforms !== 'object' || Array.isArray(doc.platforms)) {
    errors.push('Las reglas por plataforma son obligatorias.')
  } else if (Object.keys(doc.platforms).length < 1) {
    errors.push('Debe existir al menos una plataforma.')
  } else {
    for (const [id, rules] of Object.entries(doc.platforms)) {
      if (typeof rules !== 'string') {
        errors.push(`Las reglas de la plataforma "${id}" deben ser texto.`)
      }
    }
  }
  if (
    doc.contentTypes != null &&
    (typeof doc.contentTypes !== 'object' || Array.isArray(doc.contentTypes))
  ) {
    errors.push('contentTypes debe ser un objeto.')
  }
  if (
    doc.generation != null &&
    (typeof doc.generation !== 'object' || Array.isArray(doc.generation))
  ) {
    errors.push('generation debe ser un objeto.')
  }

  return { ok: errors.length === 0, errors }
}

export function nextPublishedVersion(existingVersions = []) {
  let max = 1
  for (const entry of existingVersions) {
    const version = typeof entry === 'string' ? entry : entry?.version
    const match = String(version || '').match(/^v(\d+)$/)
    if (match) {
      max = Math.max(max, parseInt(match[1], 10))
    }
  }
  return `v${max + 1}`
}

function createDraftId() {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function readMeta() {
  const meta = await getJson(KEYS.meta)
  if (!meta) return emptyMeta()
  return {
    activeVersion: meta.activeVersion || null,
    draft: meta.draft || null,
    versions: Array.isArray(meta.versions) ? meta.versions : [],
    updatedAt: meta.updatedAt || null,
  }
}

async function writeMeta(meta) {
  await putJson(KEYS.meta, {
    ...meta,
    updatedAt: new Date().toISOString(),
  })
}

async function readAuditLog() {
  const data = await getJson(KEYS.audit)
  if (!data) return []
  return Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : []
}

async function writeAuditLog(events) {
  await putJson(KEYS.audit, {
    events: events.slice(0, MAX_AUDIT),
    updatedAt: new Date().toISOString(),
  })
}

async function appendAudit(event) {
  const events = prependAuditEvent(await readAuditLog(), event, MAX_AUDIT)
  await writeAuditLog(events)
  return events
}

/**
 * Ensure bucket has at least the MVP default as the active published version.
 * No-op when S3 is not configured.
 */
export async function ensureGuidelinesSeeded({ seededBy = 'system' } = {}) {
  if (!getBucket()) return null

  const meta = await readMeta()
  if (meta.activeVersion) {
    const existing = await getJson(KEYS.version(meta.activeVersion))
    if (existing) return meta
  }

  const seed = normalizeGuidelineDocument(cloneGuidelines(getDefaultGuidelines()))
  const version = seed.version || 'mvp-default-v1'
  const activatedAt = new Date().toISOString()
  const published = {
    ...seed,
    version,
    updatedAt: activatedAt,
    updatedBy: seededBy,
  }

  await putJson(KEYS.version(version), published)
  const nextMeta = {
    activeVersion: version,
    draft: null,
    versions: [
      {
        version,
        activatedAt,
        activatedBy: seededBy,
      },
    ],
  }
  await writeMeta(nextMeta)

  const existingAudit = await readAuditLog()
  if (existingAudit.length === 0) {
    await writeAuditLog([
      createAuditEvent({
        action: 'activated',
        version,
        by: seededBy,
        detail: `Semilla inicial ${version}`,
      }),
    ])
  }

  return nextMeta
}

export async function getActiveGuidelines() {
  if (!getBucket()) {
    return getDefaultGuidelines()
  }

  try {
    const meta = (await ensureGuidelinesSeeded()) || (await readMeta())
    if (!meta?.activeVersion) {
      return getDefaultGuidelines()
    }
    const doc = await getJson(KEYS.version(meta.activeVersion))
    if (!doc) {
      console.warn('guidelines-store: active version missing; falling back to defaults')
      return getDefaultGuidelines()
    }
    return normalizeGuidelineDocument(doc)
  } catch (error) {
    console.error('guidelines-store: getActiveGuidelines failed; using defaults', error)
    return getDefaultGuidelines()
  }
}

export async function listGuidelineVersions() {
  if (!getBucket()) {
    const defaults = getDefaultGuidelines()
    return [
      {
        version: defaults.version,
        activatedAt: null,
        activatedBy: null,
        status: 'active',
      },
    ]
  }

  const meta = (await ensureGuidelinesSeeded()) || (await readMeta())
  const activeVersion = meta.activeVersion
  return (meta.versions || []).map((entry) => ({
    version: entry.version,
    activatedAt: entry.activatedAt || null,
    activatedBy: entry.activatedBy || null,
    status: entry.version === activeVersion ? 'active' : 'historical',
  }))
}

export async function getGuidelineVersion(version) {
  if (!version) return null
  if (!getBucket()) {
    const defaults = getDefaultGuidelines()
    return defaults.version === version ? defaults : null
  }
  await ensureGuidelinesSeeded()
  const doc = await getJson(KEYS.version(version))
  return doc ? normalizeGuidelineDocument(doc) : null
}

export async function getGuidelineDraft() {
  if (!getBucket()) return null
  const meta = await readMeta()
  if (!meta.draft?.id) return null
  const record = await getJson(KEYS.draft(meta.draft.id))
  if (!record) return null
  return {
    id: record.id,
    basedOn: record.basedOn,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    document: normalizeGuidelineDocument(record.document),
  }
}

export async function getGuidelineAuditLog() {
  if (!getBucket()) return []
  return readAuditLog()
}

/**
 * Snapshot for the management UI.
 */
export async function getGuidelinesWorkspace() {
  const [active, draft, versions, auditLog] = await Promise.all([
    getActiveGuidelines(),
    getGuidelineDraft(),
    listGuidelineVersions(),
    getGuidelineAuditLog(),
  ])
  return { active, draft, versions, auditLog }
}

export async function createGuidelineDraft({ createdBy, basedOnVersion } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  const meta =
    (await ensureGuidelinesSeeded({ seededBy: createdBy || 'system' })) || (await readMeta())
  if (meta.draft?.id) {
    const err = new Error(
      'Ya existe un borrador. Guárdalo, actívalo o descártalo antes de crear otro.'
    )
    err.code = 'DRAFT_EXISTS'
    throw err
  }

  const sourceVersion = basedOnVersion || meta.activeVersion
  let sourceDoc = sourceVersion ? await getJson(KEYS.version(sourceVersion)) : null
  if (!sourceDoc) {
    sourceDoc = await getActiveGuidelines()
  }

  const id = createDraftId()
  const updatedAt = new Date().toISOString()
  const updatedBy = createdBy || 'Usuario'
  const document = normalizeGuidelineDocument(cloneGuidelines(sourceDoc))

  /** @type {GuidelineDraftRecord} */
  const record = {
    id,
    basedOn: sourceVersion || document.version,
    document,
    updatedAt,
    updatedBy,
  }

  await putJson(KEYS.draft(id), record)
  await writeMeta({
    ...meta,
    draft: {
      id,
      basedOn: record.basedOn,
      updatedAt,
      updatedBy,
    },
  })

  const auditLog = await appendAudit(
    createAuditEvent({
      action: 'created_draft',
      version: record.basedOn,
      by: updatedBy,
      detail: `Borrador creado desde ${record.basedOn}`,
    })
  )

  return { draft: { ...record, document }, auditLog }
}

export async function saveGuidelineDraft(draftId, document, { updatedBy } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }
  if (!draftId) {
    throw new Error('draftId es obligatorio')
  }

  const meta = await readMeta()
  if (!meta.draft?.id || meta.draft.id !== draftId) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const normalized = normalizeGuidelineDocument(cloneGuidelines(document))
  const validation = validateGuidelineDocument(normalized)
  if (!validation.ok) {
    const err = new Error(validation.errors.join(' '))
    err.code = 'VALIDATION_FAILED'
    err.errors = validation.errors
    throw err
  }

  const existing = await getJson(KEYS.draft(draftId))
  if (!existing) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const updatedAt = new Date().toISOString()
  const by = updatedBy || 'Usuario'
  const record = {
    ...existing,
    document: normalized,
    updatedAt,
    updatedBy: by,
  }

  await putJson(KEYS.draft(draftId), record)
  await writeMeta({
    ...meta,
    draft: {
      id: draftId,
      basedOn: record.basedOn,
      updatedAt,
      updatedBy: by,
    },
  })

  const auditLog = await appendAudit(
    createAuditEvent({
      action: 'saved',
      version: record.basedOn,
      by,
      detail: 'Borrador guardado',
    })
  )

  return { draft: { ...record, document: normalized }, auditLog }
}

export async function discardGuidelineDraft(draftId, { discardedBy } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  const meta = await readMeta()
  if (!meta.draft?.id || (draftId && meta.draft.id !== draftId)) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const id = meta.draft.id
  const basedOn = meta.draft.basedOn
  // Clear the draft pointer first so the UI recovers even without DeleteObject.
  await writeMeta({
    ...meta,
    draft: null,
  })

  const auditLog = await appendAudit(
    createAuditEvent({
      action: 'discarded_draft',
      version: basedOn,
      by: discardedBy || 'Usuario',
      detail: 'Borrador descartado',
    })
  )

  await deleteJson(KEYS.draft(id))

  return { auditLog }
}

export async function activateGuidelineVersion(draftId, { activatedBy } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  const meta = await readMeta()
  if (!meta.draft?.id || meta.draft.id !== draftId) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const record = await getJson(KEYS.draft(draftId))
  if (!record?.document) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const normalized = normalizeGuidelineDocument(cloneGuidelines(record.document))
  const validation = validateGuidelineDocument(normalized)
  if (!validation.ok) {
    const err = new Error(validation.errors.join(' '))
    err.code = 'VALIDATION_FAILED'
    err.errors = validation.errors
    throw err
  }

  const by = activatedBy || 'Usuario'
  const activatedAt = new Date().toISOString()
  const version = nextPublishedVersion(meta.versions)
  const published = {
    ...normalized,
    version,
    updatedAt: activatedAt,
    updatedBy: by,
  }

  // Publish first, then point meta at the new active version and clear the
  // draft pointer. Draft object cleanup is best-effort (may lack DeleteObject).
  await putJson(KEYS.version(version), published)
  await writeMeta({
    activeVersion: version,
    draft: null,
    versions: [
      {
        version,
        activatedAt,
        activatedBy: by,
      },
      ...(meta.versions || []),
    ],
  })

  const auditLog = await appendAudit(
    createAuditEvent({
      action: 'activated',
      version,
      by,
      detail: `Versión ${version} activada`,
    })
  )

  await deleteJson(KEYS.draft(draftId))

  return { active: published, auditLog }
}

/**
 * Re-point active to a prior published version. Does not rewrite history objects.
 */
export async function rollbackGuidelineVersion(version, { rolledBackBy } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }
  if (!version) {
    throw new Error('version es obligatoria')
  }

  const meta = (await ensureGuidelinesSeeded()) || (await readMeta())
  if (meta.activeVersion === version) {
    const err = new Error('Esa versión ya está activa.')
    err.code = 'ALREADY_ACTIVE'
    throw err
  }

  const doc = await getJson(KEYS.version(version))
  if (!doc) {
    const err = new Error('Versión no encontrada')
    err.code = 'VERSION_NOT_FOUND'
    throw err
  }

  const known = (meta.versions || []).some((entry) => entry.version === version)
  if (!known) {
    const err = new Error('Versión no encontrada')
    err.code = 'VERSION_NOT_FOUND'
    throw err
  }

  const by = rolledBackBy || 'Usuario'
  const activatedAt = new Date().toISOString()

  await writeMeta({
    ...meta,
    activeVersion: version,
    // Keep draft intact; rollback only changes the live pointer.
    versions: [
      {
        version,
        activatedAt,
        activatedBy: by,
      },
      ...(meta.versions || []).filter((entry) => entry.version !== version),
    ],
  })

  const auditLog = await appendAudit(
    createAuditEvent({
      action: 'rollback',
      version,
      by,
      detail: `Rollback a versión ${version}`,
    })
  )

  return { active: normalizeGuidelineDocument(doc), auditLog }
}
