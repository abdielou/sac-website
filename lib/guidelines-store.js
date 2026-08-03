import AWS from 'aws-sdk'
import { getDefaultGuidelines } from './ai-guidelines'
import { cloneGuidelines, createAuditEvent, prependAuditEvent } from './ai-guidelines-draft'
import {
  GUIDELINES_SCHEMA_VERSION,
  diffGuidelineDocuments,
  migrateGuidelineDocumentToV3,
  normalizeGuidelineDocumentV3,
  validateGuidelineDraft,
  validateGuidelineForActivation,
} from './ai-guidelines-schema'

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
  state: 'guidelines/state.json',
  audit: 'guidelines/audit.json',
  legacyDraft: (id) => `guidelines/drafts/${id}.json`,
  draftRevision: (id, revision) => `guidelines/drafts/${id}/revisions/${revision}.json`,
  version: (version) => `guidelines/versions/${encodeURIComponent(version)}.json`,
}

const MAX_AUDIT = 100
const MAX_STATE_WRITE_ATTEMPTS = 5

/**
 * @typedef {Object} GuidelinesMeta
 * @property {string|null} activeVersion
 * @property {{ id: string, basedOn: string, updatedAt: string, updatedBy: string }|null} draft
 * @property {Array<{ version: string, activatedAt: string, activatedBy: string }>} versions
 * @property {Array<object>} pendingAuditEvents
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
    activations: [],
    pendingAuditEvents: [],
    updatedAt: null,
  }
}

function isNotFoundError(error) {
  return error?.code === 'NoSuchKey' || error?.statusCode === 404
}

async function getJsonWithMetadata(key) {
  const bucket = getBucket()
  if (!bucket) return { data: null, etag: null }

  try {
    const s3 = getGuidelinesS3Client()
    const result = await s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise()
    return {
      data: JSON.parse(result.Body.toString()),
      etag: result.ETag || null,
    }
  } catch (error) {
    if (isNotFoundError(error)) return { data: null, etag: null }
    console.error('guidelines-store: failed to read', key, error)
    throw new Error(`Failed to read guidelines object: ${key}`)
  }
}

async function getJson(key) {
  return (await getJsonWithMetadata(key)).data
}

function isPreconditionError(error) {
  return error?.code === 'PreconditionFailed' || error?.statusCode === 412
}

async function putJson(key, data, { ifAbsent = false, ifMatch = null } = {}) {
  const bucket = getBucket()
  if (!bucket) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  const s3 = getGuidelinesS3Client()
  try {
    const request = s3.putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      ...(ifAbsent ? { IfNoneMatch: '*' } : null),
    })
    if (ifMatch) {
      request.on('build', () => {
        request.httpRequest.headers['If-Match'] = ifMatch
      })
    }
    await request.promise()
  } catch (error) {
    if (isPreconditionError(error)) {
      const conflict = new Error(`El objeto cambió antes de poder escribirlo: ${key}`)
      conflict.code = 'PRECONDITION_FAILED'
      throw conflict
    }
    throw error
  }
}

/**
 * Best-effort delete. Activate/discard must not fail if the IAM role lacks
 * s3:DeleteObject — clearing the state pointer is enough for correctness.
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
      'guidelines-store: failed to delete (continuing; state pointer is source of truth)',
      key,
      error?.code || error?.message || error
    )
    return false
  }
}

export function validateGuidelineDocument(doc) {
  return validateGuidelineForActivation(doc)
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

function normalizeMeta(meta) {
  if (!meta) return emptyMeta()
  return {
    activeVersion: meta.activeVersion || null,
    draft: meta.draft
      ? {
          ...meta.draft,
          revision: Number.isInteger(meta.draft.revision) ? meta.draft.revision : 1,
        }
      : null,
    versions: Array.isArray(meta.versions) ? meta.versions : [],
    activations: Array.isArray(meta.activations) ? meta.activations : [],
    pendingAuditEvents: Array.isArray(meta.pendingAuditEvents) ? meta.pendingAuditEvents : [],
    updatedAt: meta.updatedAt || null,
  }
}

async function readMetaSnapshot() {
  const { data, etag } = await getJsonWithMetadata(KEYS.state)
  return { meta: normalizeMeta(data), etag }
}

async function readMeta() {
  return (await readMetaSnapshot()).meta
}

async function writeMeta(meta, expectedEtag) {
  const stored = {
    ...meta,
    updatedAt: new Date().toISOString(),
  }
  await putJson(KEYS.state, stored, expectedEtag ? { ifMatch: expectedEtag } : { ifAbsent: true })
  return stored
}

async function readDraftRecord(metaDraft) {
  if (!metaDraft?.id) return null
  const revision = Number.isInteger(metaDraft.revision) ? metaDraft.revision : 1
  let record = await getJson(KEYS.draftRevision(metaDraft.id, revision))
  if (!record) {
    record = await getJson(KEYS.legacyDraft(metaDraft.id))
  }
  return record
    ? { ...record, revision: Number.isInteger(record.revision) ? record.revision : revision }
    : null
}

function draftConflict() {
  const error = new Error(
    'El borrador cambió desde que lo cargaste. Actualiza la página antes de volver a guardar.'
  )
  error.code = 'DRAFT_CONFLICT'
  return error
}

function isVersionReferenced(meta, version) {
  return (
    meta.activeVersion === version ||
    (meta.versions || []).some((entry) => entry.version === version) ||
    (meta.activations || []).some((entry) => entry.version === version)
  )
}

async function cleanupUncommittedVersion(meta, version, draftId, revision) {
  if (!version || isVersionReferenced(meta, version)) return false
  const existing = await getJson(KEYS.version(version))
  if (
    !existing ||
    existing.sourceDraftId !== draftId ||
    existing.sourceDraftRevision !== revision
  ) {
    return false
  }
  return deleteJson(KEYS.version(version))
}

async function publishActivationDocument(meta, document, { draftId, revision, publishedBy }) {
  const consideredVersions = [...(meta.versions || [])]

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const version = nextPublishedVersion(consideredVersions)
    const existing = await getJson(KEYS.version(version))
    if (existing) {
      if (existing.sourceDraftId === draftId && existing.sourceDraftRevision === revision) {
        return { version, published: existing }
      }

      if (existing.sourceDraftId === draftId && !isVersionReferenced(meta, version)) {
        const removed = await deleteJson(KEYS.version(version))
        if (removed) continue
      }

      consideredVersions.push({ version })
      continue
    }

    const published = {
      ...document,
      version,
      updatedAt: new Date().toISOString(),
      updatedBy: publishedBy,
      sourceDraftId: draftId,
      sourceDraftRevision: revision,
    }
    try {
      await putJson(KEYS.version(version), published, { ifAbsent: true })
      return { version, published }
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
    }
  }

  const conflict = new Error('No se pudo reservar una versión de publicación disponible.')
  conflict.code = 'ACTIVATION_CONFLICT'
  throw conflict
}

function sameContentTypeDefinition(left, right) {
  const selectDefinition = (entry) => ({
    id: entry?.id,
    label: entry?.label,
    description: entry?.description,
    fields: entry?.fields,
    titleSource: entry?.titleSource,
    validation: entry?.validation,
    generation: entry?.generation,
    visual: entry?.visual,
  })
  return JSON.stringify(selectDefinition(left)) === JSON.stringify(selectDefinition(right))
}

async function mergeHistoricalContentTypesAsArchived(document, meta) {
  const normalized = normalizeGuidelineDocumentV3(cloneGuidelines(document))
  const currentIds = new Set(normalized.contentTypeCatalog.map((entry) => entry.id))
  const historicalEntries = new Map()

  for (const entry of meta.versions || []) {
    if (!entry?.version) continue
    const historicalDocument = await getJson(KEYS.version(entry.version))
    if (!historicalDocument) {
      const error = new Error(`La versión publicada ${entry.version} no está disponible.`)
      error.code = 'VERSION_NOT_FOUND'
      throw error
    }
    for (const contentType of migrateGuidelineDocumentToV3(historicalDocument).contentTypeCatalog ||
      []) {
      if (!historicalEntries.has(contentType.id)) {
        historicalEntries.set(contentType.id, contentType)
      }
    }
  }

  const archivedHistory = [...historicalEntries.values()]
    .filter((entry) => !currentIds.has(entry.id))
    .map((entry) => ({ ...cloneGuidelines(entry), status: 'archived' }))
  if (archivedHistory.length === 0) return normalized

  return normalizeGuidelineDocumentV3({
    ...normalized,
    contentTypeCatalog: [...normalized.contentTypeCatalog, ...archivedHistory],
  })
}

function normalizeDraftDocument(document) {
  if (
    (document?.schemaVersion === 2 || document?.schemaVersion === GUIDELINES_SCHEMA_VERSION) &&
    !Array.isArray(document?.contentTypeCatalog)
  ) {
    return cloneGuidelines(document)
  }
  return normalizeGuidelineDocumentV3(cloneGuidelines(document))
}

async function readAuditSnapshot() {
  const { data, etag } = await getJsonWithMetadata(KEYS.audit)
  const events = !data
    ? []
    : Array.isArray(data.events)
      ? data.events
      : Array.isArray(data)
        ? data
        : []
  return { events, etag }
}

async function readAuditLog() {
  const { events } = await readAuditSnapshot()
  return events
}

async function writeAuditLog(events, expectedEtag) {
  await putJson(
    KEYS.audit,
    {
      events: events.slice(0, MAX_AUDIT),
      updatedAt: new Date().toISOString(),
    },
    expectedEtag ? { ifMatch: expectedEtag } : { ifAbsent: true }
  )
}

async function appendAuditEvents(events) {
  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    const snapshot = await readAuditSnapshot()
    let audit = snapshot.events
    const existingIds = new Set(audit.map((event) => event?.id).filter(Boolean))
    for (const event of events) {
      if (event?.id && existingIds.has(event.id)) continue
      audit = prependAuditEvent(audit, event, MAX_AUDIT)
      if (event?.id) existingIds.add(event.id)
    }
    try {
      await writeAuditLog(audit, snapshot.etag)
      return audit
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
    }
  }

  const error = new Error('El audit log cambió repetidamente durante la actualización.')
  error.code = 'STATE_CONFLICT'
  throw error
}

function queueAuditEvents(meta, events) {
  const pending = Array.isArray(meta.pendingAuditEvents) ? meta.pendingAuditEvents : []
  const pendingIds = new Set(pending.map((event) => event?.id).filter(Boolean))
  return {
    ...meta,
    pendingAuditEvents: [
      ...pending,
      ...events.filter((event) => !event?.id || !pendingIds.has(event.id)),
    ],
  }
}

async function flushPendingAuditEvents() {
  if (!getBucket()) return []

  let lastAuditLog = null
  try {
    for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
      const snapshot = await readMetaSnapshot()
      const pending = snapshot.meta.pendingAuditEvents || []
      if (pending.length === 0) {
        return lastAuditLog || (await readAuditLog())
      }

      lastAuditLog = await appendAuditEvents(pending)
      const flushedIds = new Set(pending.map((event) => event?.id).filter(Boolean))
      const remaining = (snapshot.meta.pendingAuditEvents || []).filter(
        (event) => event?.id && !flushedIds.has(event.id)
      )
      try {
        await writeMeta(
          {
            ...snapshot.meta,
            pendingAuditEvents: remaining,
          },
          snapshot.etag
        )
        return lastAuditLog
      } catch (error) {
        if (error.code !== 'PRECONDITION_FAILED') throw error
      }
    }
  } catch (error) {
    console.error('guidelines-store: pending audit flush failed', error)
  }

  if (lastAuditLog) return lastAuditLog
  return readAuditLog().catch(() => [])
}

/**
 * Ensure bucket has at least the MVP default as the active published version.
 * No-op when S3 is not configured.
 */
export async function ensureGuidelinesSeeded({ seededBy = 'system' } = {}) {
  if (!getBucket()) return null
  await flushPendingAuditEvents()

  const seed = normalizeGuidelineDocumentV3(cloneGuidelines(getDefaultGuidelines()))
  const version = seed.version || 'mvp-default-v1'
  const auditEvent = createAuditEvent({
    action: 'activated',
    version,
    by: seededBy,
    detail: `Semilla inicial ${version}`,
  })

  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    const { meta, etag } = await readMetaSnapshot()
    if (meta.activeVersion) {
      const existing = await getJson(KEYS.version(meta.activeVersion))
      if (existing) return meta
      const error = new Error('La versión activa de Guidelines no está disponible.')
      error.code = 'ACTIVE_GUIDELINES_UNAVAILABLE'
      throw error
    }
    if (etag) {
      const error = new Error('El estado de Guidelines no contiene una versión activa.')
      error.code = 'ACTIVE_GUIDELINES_UNAVAILABLE'
      throw error
    }

    const activatedAt = new Date().toISOString()
    const published = {
      ...seed,
      version,
      updatedAt: activatedAt,
      updatedBy: seededBy,
    }

    try {
      await putJson(KEYS.version(version), published, { ifAbsent: true })
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
    }

    const nextMeta = queueAuditEvents(
      {
        ...meta,
        activeVersion: version,
        versions: [
          {
            version,
            activatedAt,
            activatedBy: seededBy,
          },
          ...(meta.versions || []).filter((entry) => entry.version !== version),
        ],
      },
      [auditEvent]
    )

    try {
      const storedMeta = await writeMeta(nextMeta, etag)
      await flushPendingAuditEvents()
      return storedMeta
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
    }
  }

  const error = new Error('El estado de Guidelines cambió repetidamente durante la inicialización.')
  error.code = 'STATE_CONFLICT'
  throw error
}

export async function getActiveGuidelinesStrict() {
  if (!getBucket()) {
    return getDefaultGuidelines()
  }

  const meta = (await ensureGuidelinesSeeded()) || (await readMeta())
  if (!meta?.activeVersion) {
    const error = new Error('No hay una versión activa de Guidelines.')
    error.code = 'ACTIVE_GUIDELINES_UNAVAILABLE'
    throw error
  }
  const doc = await getJson(KEYS.version(meta.activeVersion))
  if (!doc) {
    const error = new Error('La versión activa de Guidelines no está disponible.')
    error.code = 'ACTIVE_GUIDELINES_UNAVAILABLE'
    throw error
  }
  return migrateGuidelineDocumentToV3(doc)
}

export async function getActiveGuidelines() {
  try {
    return await getActiveGuidelinesStrict()
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
  return doc ? migrateGuidelineDocumentToV3(doc) : null
}

export async function getGuidelineDraft() {
  if (!getBucket()) return null
  const meta = await readMeta()
  if (!meta.draft?.id) return null
  const record = await readDraftRecord(meta.draft)
  if (!record) return null
  return {
    id: record.id,
    basedOn: record.basedOn,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    revision: record.revision,
    document: normalizeDraftDocument(record.document),
  }
}

export async function getGuidelineAuditLog() {
  if (!getBucket()) return []
  return flushPendingAuditEvents()
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

  await ensureGuidelinesSeeded({ seededBy: createdBy || 'system' })
  let snapshot = await readMetaSnapshot()
  const { meta } = snapshot
  if (meta.draft?.id) {
    const err = new Error(
      'Ya existe un borrador. Guárdalo, actívalo o descártalo antes de crear otro.'
    )
    err.code = 'DRAFT_EXISTS'
    throw err
  }

  const sourceVersion = basedOnVersion || meta.activeVersion
  let sourceDoc = sourceVersion ? await getJson(KEYS.version(sourceVersion)) : null
  if (basedOnVersion && !sourceDoc) {
    const err = new Error('Versión base no encontrada')
    err.code = 'VERSION_NOT_FOUND'
    throw err
  }
  if (!sourceDoc) {
    sourceDoc = await getActiveGuidelines()
  }

  const id = createDraftId()
  const updatedAt = new Date().toISOString()
  const updatedBy = createdBy || 'Usuario'
  const document = await mergeHistoricalContentTypesAsArchived(
    migrateGuidelineDocumentToV3(cloneGuidelines(sourceDoc)),
    meta
  )
  const revision = 1

  /** @type {GuidelineDraftRecord} */
  const record = {
    id,
    basedOn: sourceVersion || document.version,
    document,
    revision,
    updatedAt,
    updatedBy,
  }
  const auditEvent = createAuditEvent({
    action: 'created_draft',
    version: record.basedOn,
    by: updatedBy,
    detail: `Borrador creado desde ${record.basedOn}`,
  })

  await putJson(KEYS.draftRevision(id, revision), record, { ifAbsent: true })
  let committed = false
  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    if (snapshot.meta.draft?.id) {
      const err = new Error(
        'Ya existe un borrador. Guárdalo, actívalo o descártalo antes de crear otro.'
      )
      err.code = 'DRAFT_EXISTS'
      throw err
    }

    try {
      await writeMeta(
        queueAuditEvents(
          {
            ...snapshot.meta,
            draft: {
              id,
              basedOn: record.basedOn,
              updatedAt,
              updatedBy,
              revision,
            },
          },
          [auditEvent]
        ),
        snapshot.etag
      )
      committed = true
      break
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
      snapshot = await readMetaSnapshot()
    }
  }
  if (!committed) throw draftConflict()

  const auditLog = await flushPendingAuditEvents()

  return { draft: { ...record, document }, auditLog }
}

export async function saveGuidelineDraft(draftId, document, { updatedBy, expectedRevision } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }
  if (!draftId) {
    throw new Error('draftId es obligatorio')
  }

  await flushPendingAuditEvents()
  let snapshot = await readMetaSnapshot()
  const { meta } = snapshot
  if (!meta.draft?.id || meta.draft.id !== draftId) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  if (!Number.isInteger(expectedRevision) || meta.draft.revision !== expectedRevision) {
    throw draftConflict()
  }

  const validation = validateGuidelineDraft(document)
  if (!validation.ok) {
    const err = new Error(validation.errors.join(' '))
    err.code = 'VALIDATION_FAILED'
    err.errors = validation.errors
    throw err
  }
  const normalized = normalizeDraftDocument(document)

  const existing = await readDraftRecord(meta.draft)
  if (!existing) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const updatedAt = new Date().toISOString()
  const by = updatedBy || 'Usuario'
  const revision = expectedRevision + 1
  const record = {
    ...existing,
    document: normalized,
    revision,
    updatedAt,
    updatedBy: by,
  }
  const auditEvent = createAuditEvent({
    action: 'saved',
    version: record.basedOn,
    by,
    detail: 'Borrador guardado',
  })

  try {
    await putJson(KEYS.draftRevision(draftId, revision), record, { ifAbsent: true })
  } catch (error) {
    if (error.code === 'PRECONDITION_FAILED') throw draftConflict()
    throw error
  }
  let committed = false
  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    if (snapshot.meta.draft?.id !== draftId || snapshot.meta.draft.revision !== expectedRevision) {
      throw draftConflict()
    }

    try {
      await writeMeta(
        queueAuditEvents(
          {
            ...snapshot.meta,
            draft: {
              id: draftId,
              basedOn: record.basedOn,
              updatedAt,
              updatedBy: by,
              revision,
            },
          },
          [auditEvent]
        ),
        snapshot.etag
      )
      committed = true
      break
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
      snapshot = await readMetaSnapshot()
    }
  }
  if (!committed) throw draftConflict()

  const auditLog = await flushPendingAuditEvents()

  return { draft: { ...record, document: normalized }, auditLog }
}

export async function discardGuidelineDraft(draftId, { discardedBy } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  await flushPendingAuditEvents()
  let snapshot = await readMetaSnapshot()
  const { meta } = snapshot
  if (!meta.draft?.id || (draftId && meta.draft.id !== draftId)) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const id = meta.draft.id
  const basedOn = meta.draft.basedOn
  const auditEvent = createAuditEvent({
    action: 'discarded_draft',
    version: basedOn,
    by: discardedBy || 'Usuario',
    detail: 'Borrador descartado',
  })
  let discardedDraft = meta.draft
  let committed = false
  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    if (!snapshot.meta.draft?.id || snapshot.meta.draft.id !== id) {
      const err = new Error('Borrador no encontrado')
      err.code = 'DRAFT_NOT_FOUND'
      throw err
    }

    discardedDraft = snapshot.meta.draft
    try {
      await writeMeta(
        queueAuditEvents(
          {
            ...snapshot.meta,
            draft: null,
          },
          [auditEvent]
        ),
        snapshot.etag
      )
      committed = true
      break
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
      snapshot = await readMetaSnapshot()
    }
  }
  if (!committed) throw draftConflict()

  const auditLog = await flushPendingAuditEvents()

  await deleteJson(KEYS.draftRevision(id, discardedDraft.revision || 1))
  await deleteJson(KEYS.legacyDraft(id))

  return { auditLog }
}

export async function activateGuidelineVersion(draftId, { activatedBy, expectedRevision } = {}) {
  if (!getBucket()) {
    throw new Error('S3_ARTICLES_BUCKET_NAME no está configurado')
  }

  await flushPendingAuditEvents()
  let snapshot = await readMetaSnapshot()
  const { meta } = snapshot
  const completed = (meta.activations || []).find((entry) => entry.draftId === draftId)
  if (completed) {
    if (Number.isInteger(expectedRevision) && completed.revision !== expectedRevision) {
      throw draftConflict()
    }
    const existing = await getJson(KEYS.version(completed.version))
    if (!existing) {
      const error = new Error('La versión activada no se pudo recuperar.')
      error.code = 'VERSION_NOT_FOUND'
      throw error
    }
    return {
      active: migrateGuidelineDocumentToV3(existing),
      auditLog: await flushPendingAuditEvents(),
      idempotent: true,
      diff: completed.diff || null,
    }
  }

  if (!meta.draft?.id || meta.draft.id !== draftId) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }
  if (!Number.isInteger(expectedRevision) || meta.draft.revision !== expectedRevision) {
    throw draftConflict()
  }

  const record = await readDraftRecord(meta.draft)
  if (!record?.document) {
    const err = new Error('Borrador no encontrado')
    err.code = 'DRAFT_NOT_FOUND'
    throw err
  }

  const baseDocument = record.basedOn ? await getJson(KEYS.version(record.basedOn)) : null
  if (record.basedOn && !baseDocument) {
    const err = new Error(`La versión base ${record.basedOn} no está disponible.`)
    err.code = 'VERSION_NOT_FOUND'
    throw err
  }

  const historicalEntries = new Map()
  const historicalVersions = new Set((meta.versions || []).map((entry) => entry.version))
  if (record.basedOn) historicalVersions.add(record.basedOn)
  for (const historicalVersion of historicalVersions) {
    const historicalDocument =
      historicalVersion === record.basedOn
        ? baseDocument
        : await getJson(KEYS.version(historicalVersion))
    if (!historicalDocument) {
      const err = new Error(`La versión publicada ${historicalVersion} no está disponible.`)
      err.code = 'VERSION_NOT_FOUND'
      throw err
    }
    for (const entry of migrateGuidelineDocumentToV3(historicalDocument).contentTypeCatalog || []) {
      if (!historicalEntries.has(entry.id)) historicalEntries.set(entry.id, entry)
    }
  }

  const normalized = normalizeGuidelineDocumentV3(cloneGuidelines(record.document))
  const validation = validateGuidelineForActivation(normalized, {
    baseDocument: baseDocument ? migrateGuidelineDocumentToV3(baseDocument) : null,
  })
  const baseIds = new Set(
    (baseDocument ? migrateGuidelineDocumentToV3(baseDocument).contentTypeCatalog : []).map(
      (entry) => entry.id
    )
  )
  const currentEntries = new Map(normalized.contentTypeCatalog.map((entry) => [entry.id, entry]))
  const missingHistoricalIds = [...historicalEntries.keys()].filter((id) => !currentEntries.has(id))
  const invalidRestoredIds = [...currentEntries.values()]
    .filter((entry) => historicalEntries.has(entry.id) && !baseIds.has(entry.id))
    .filter((entry) => !sameContentTypeDefinition(entry, historicalEntries.get(entry.id)))
    .map((entry) => entry.id)
  const activationErrors = [
    ...validation.errors,
    ...missingHistoricalIds.map(
      (id) =>
        `El tipo publicado "${id}" no puede desaparecer; debe conservarse o archivarse explícitamente.`
    ),
    ...invalidRestoredIds.map(
      (id) =>
        `El identificador publicado "${id}" está reservado; al recuperarlo tras un rollback debe conservar su definición publicada.`
    ),
  ]
  if (activationErrors.length > 0) {
    const err = new Error(activationErrors.join(' '))
    err.code = 'VALIDATION_FAILED'
    err.errors = activationErrors
    throw err
  }

  const by = activatedBy || 'Usuario'
  const { version, published } = await publishActivationDocument(meta, validation.document, {
    draftId,
    revision: expectedRevision,
    publishedBy: by,
  })

  const activatedAt = published.updatedAt
  const diff = diffGuidelineDocuments(baseDocument || getDefaultGuidelines(), published)
  const auditEvents = [
    createAuditEvent({
      action: 'activated',
      version,
      by,
      detail: `Versión ${version} activada`,
    }),
    ...diff.created.map((entry) =>
      createAuditEvent({
        action: 'created_content_type',
        version,
        by,
        detail: `${entry.label} (${entry.id})`,
      })
    ),
    ...diff.archived.map((entry) =>
      createAuditEvent({
        action: 'archived_content_type',
        version,
        by,
        detail: `${entry.label} (${entry.id})`,
      })
    ),
  ]
  let committed = false
  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    const completedActivation = (snapshot.meta.activations || []).find(
      (entry) => entry.draftId === draftId
    )
    if (completedActivation) {
      if (completedActivation.revision !== expectedRevision) {
        await cleanupUncommittedVersion(snapshot.meta, version, draftId, expectedRevision)
        throw draftConflict()
      }
      const existing = await getJson(KEYS.version(completedActivation.version))
      if (!existing) {
        const error = new Error('La versión activada no se pudo recuperar.')
        error.code = 'VERSION_NOT_FOUND'
        throw error
      }
      return {
        active: migrateGuidelineDocumentToV3(existing),
        auditLog: await flushPendingAuditEvents(),
        idempotent: true,
        diff: completedActivation.diff || null,
      }
    }
    if (snapshot.meta.draft?.id !== draftId || snapshot.meta.draft.revision !== expectedRevision) {
      await cleanupUncommittedVersion(snapshot.meta, version, draftId, expectedRevision)
      if (snapshot.meta.draft?.id === draftId) throw draftConflict()
      const conflict = new Error('El estado cambió antes de completar la activación.')
      conflict.code = 'ACTIVATION_CONFLICT'
      throw conflict
    }

    try {
      await writeMeta(
        queueAuditEvents(
          {
            ...snapshot.meta,
            activeVersion: version,
            draft: null,
            versions: [
              {
                version,
                activatedAt,
                activatedBy: published.updatedBy,
              },
              ...(snapshot.meta.versions || []).filter((entry) => entry.version !== version),
            ],
            activations: [
              {
                draftId,
                revision: expectedRevision,
                version,
                activatedAt,
                activatedBy: published.updatedBy,
                diff,
              },
              ...(snapshot.meta.activations || []).filter((entry) => entry.draftId !== draftId),
            ].slice(0, 50),
          },
          auditEvents
        ),
        snapshot.etag
      )
      committed = true
      break
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
      snapshot = await readMetaSnapshot()
    }
  }
  if (!committed) {
    await cleanupUncommittedVersion(snapshot.meta, version, draftId, expectedRevision)
    const conflict = new Error('El estado cambió repetidamente durante la activación.')
    conflict.code = 'ACTIVATION_CONFLICT'
    throw conflict
  }

  const auditLog = await flushPendingAuditEvents()

  await deleteJson(KEYS.draftRevision(draftId, expectedRevision))
  await deleteJson(KEYS.legacyDraft(draftId))

  return { active: published, auditLog, idempotent: false, diff }
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

  await ensureGuidelinesSeeded()
  const doc = await getJson(KEYS.version(version))
  if (!doc) {
    const err = new Error('Versión no encontrada')
    err.code = 'VERSION_NOT_FOUND'
    throw err
  }

  const by = rolledBackBy || 'Usuario'
  const activatedAt = new Date().toISOString()
  const auditEvent = createAuditEvent({
    action: 'rollback',
    version,
    by,
    detail: `Rollback a versión ${version}`,
  })
  let committed = false
  for (let attempt = 0; attempt < MAX_STATE_WRITE_ATTEMPTS; attempt += 1) {
    const snapshot = await readMetaSnapshot()
    if (snapshot.meta.activeVersion === version) {
      const err = new Error('Esa versión ya está activa.')
      err.code = 'ALREADY_ACTIVE'
      throw err
    }

    const known = (snapshot.meta.versions || []).some((entry) => entry.version === version)
    if (!known) {
      const err = new Error('Versión no encontrada')
      err.code = 'VERSION_NOT_FOUND'
      throw err
    }

    try {
      await writeMeta(
        queueAuditEvents(
          {
            ...snapshot.meta,
            activeVersion: version,
            versions: [
              {
                version,
                activatedAt,
                activatedBy: by,
              },
              ...(snapshot.meta.versions || []).filter((entry) => entry.version !== version),
            ],
          },
          [auditEvent]
        ),
        snapshot.etag
      )
      committed = true
      break
    } catch (error) {
      if (error.code !== 'PRECONDITION_FAILED') throw error
    }
  }
  if (!committed) {
    const error = new Error('El estado cambió repetidamente durante el rollback.')
    error.code = 'STATE_CONFLICT'
    throw error
  }

  const auditLog = await flushPendingAuditEvents()

  return { active: migrateGuidelineDocumentToV3(doc), auditLog }
}
