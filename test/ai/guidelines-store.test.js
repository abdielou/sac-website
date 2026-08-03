/**
 * @jest-environment node
 */

const mockGetObject = jest.fn()
const mockPutObject = jest.fn()
const mockDeleteObject = jest.fn()

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getObject: mockGetObject,
    putObject: mockPutObject,
    deleteObject: mockDeleteObject,
  })),
}))

import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { GUIDELINES_SCHEMA_VERSION, duplicateContentType } from '../../lib/ai-guidelines-schema'
import {
  activateGuidelineVersion,
  createGuidelineDraft,
  discardGuidelineDraft,
  getActiveGuidelines,
  getActiveGuidelinesStrict,
  listGuidelineVersions,
  nextPublishedVersion,
  rollbackGuidelineVersion,
  saveGuidelineDraft,
  validateGuidelineDocument,
} from '../../lib/guidelines-store'

function etagFor(data) {
  return `"${Buffer.from(JSON.stringify(data)).toString('base64')}"`
}

function okBody(data) {
  return {
    promise: () =>
      Promise.resolve({ Body: Buffer.from(JSON.stringify(data)), ETag: etagFor(data) }),
  }
}

function notFound() {
  const error = new Error('NoSuchKey')
  error.code = 'NoSuchKey'
  return {
    promise: () => Promise.reject(error),
  }
}

function preconditionFailedError() {
  const error = new Error('PreconditionFailed')
  error.code = 'PreconditionFailed'
  error.statusCode = 412
  return error
}

function failedPutRequest(error) {
  const request = {
    httpRequest: { headers: {} },
    on: jest.fn(() => request),
    promise: () => Promise.reject(error),
  }
  return request
}

function deleteOk() {
  return { promise: () => Promise.resolve({}) }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function legacyV1Document() {
  const document = clone(getDefaultGuidelines())
  delete document.schemaVersion
  delete document.contentTypeCatalog
  return document
}

describe('guidelines-store helpers', () => {
  test('nextPublishedVersion increments from published vN entries', () => {
    expect(nextPublishedVersion([])).toBe('v2')
    expect(nextPublishedVersion([{ version: 'mvp-default-v1' }])).toBe('v2')
    expect(nextPublishedVersion([{ version: 'v2' }, { version: 'v5' }])).toBe('v6')
  })

  test('validateGuidelineDocument rejects incomplete docs', () => {
    const result = validateGuidelineDocument({ global: '' })
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('validateGuidelineDocument accepts default seed', () => {
    expect(validateGuidelineDocument(getDefaultGuidelines()).ok).toBe(true)
  })
})

describe('guidelines-store S3 lifecycle', () => {
  const bucket = 'test-articles-bucket'
  /** @type {Map<string, any>} */
  let objects
  let conditionalWrites

  beforeEach(() => {
    objects = new Map()
    conditionalWrites = []
    process.env.S3_ARTICLES_BUCKET_NAME = bucket
    process.env.AWS_REGION = 'us-east-1'

    mockGetObject.mockImplementation(({ Key }) => {
      if (!objects.has(Key)) return notFound()
      return okBody(objects.get(Key))
    })
    mockPutObject.mockImplementation(({ Key, Body, IfNoneMatch }) => {
      const buildListeners = []
      const request = {
        httpRequest: { headers: {} },
        on: jest.fn((event, listener) => {
          if (event === 'build') buildListeners.push(listener)
          return request
        }),
        promise: () => {
          for (const listener of buildListeners) listener()
          const ifMatch = request.httpRequest.headers['If-Match'] || null
          conditionalWrites.push({ Key, ifMatch, ifNoneMatch: IfNoneMatch || null })
          if (IfNoneMatch === '*' && objects.has(Key)) {
            return Promise.reject(preconditionFailedError())
          }
          if (ifMatch && (!objects.has(Key) || ifMatch !== etagFor(objects.get(Key)))) {
            return Promise.reject(preconditionFailedError())
          }
          objects.set(Key, JSON.parse(Body))
          return Promise.resolve({})
        },
      }
      return request
    })
    mockDeleteObject.mockImplementation(({ Key }) => {
      objects.delete(Key)
      return deleteOk()
    })
  })

  afterEach(() => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
    jest.clearAllMocks()
  })

  function makeAuditUnavailable() {
    const normalPut = mockPutObject.getMockImplementation()
    let unavailable = true
    mockPutObject.mockImplementation((request) => {
      if (unavailable && request.Key === 'guidelines/audit.json') {
        return failedPutRequest(Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' }))
      }
      return normalPut(request)
    })
    return () => {
      unavailable = false
    }
  }

  test('getActiveGuidelines seeds defaults when store is empty', async () => {
    const active = await getActiveGuidelines()
    expect(active.version).toBe('mvp-default-v1')
    expect(active.schemaVersion).toBe(GUIDELINES_SCHEMA_VERSION)
    expect(active.contentTypeCatalog[0].id).toBe('observation_night')
    expect(objects.has('guidelines/state.json')).toBe(true)
    expect(objects.has('guidelines/versions/mvp-default-v1.json')).toBe(true)

    const seedPut = mockPutObject.mock.calls.find(
      ([request]) => request.Key === 'guidelines/versions/mvp-default-v1.json'
    )
    expect(seedPut?.[0].IfNoneMatch).toBe('*')
  })

  test('seed uses create-only state CAS and keeps a concurrent seed winner', async () => {
    const normalPut = mockPutObject.getMockImplementation()
    let injected = false
    mockPutObject.mockImplementation((request) => {
      if (request.Key === 'guidelines/state.json' && request.IfNoneMatch === '*' && !injected) {
        injected = true
        objects.set('guidelines/state.json', {
          activeVersion: 'mvp-default-v1',
          draft: null,
          versions: [
            {
              version: 'mvp-default-v1',
              activatedAt: '2026-08-01T10:00:00.000Z',
              activatedBy: 'other-seeder',
            },
          ],
          activations: [],
          updatedAt: '2026-08-01T10:00:00.000Z',
        })
      }
      return normalPut(request)
    })

    await expect(getActiveGuidelines()).resolves.toMatchObject({ version: 'mvp-default-v1' })
    expect(objects.get('guidelines/state.json').versions[0].activatedBy).toBe('other-seeder')
    expect(
      mockPutObject.mock.calls.find(
        ([request]) => request.Key === 'guidelines/state.json' && request.IfNoneMatch === '*'
      )
    ).toBeTruthy()
  })

  test('seed remains successful during an audit outage and repairs the event on retry', async () => {
    const restoreAudit = makeAuditUnavailable()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getActiveGuidelines()).resolves.toMatchObject({ version: 'mvp-default-v1' })
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([
      expect.objectContaining({ action: 'activated', version: 'mvp-default-v1' }),
    ])
    expect(objects.has('guidelines/audit.json')).toBe(false)

    restoreAudit()
    await expect(getActiveGuidelines()).resolves.toMatchObject({ version: 'mvp-default-v1' })
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([])
    expect(
      objects
        .get('guidelines/audit.json')
        .events.filter(
          ({ action, version }) => action === 'activated' && version === 'mvp-default-v1'
        )
    ).toHaveLength(1)

    errorSpy.mockRestore()
  })

  test('strict runtime reads fail instead of substituting defaults on store errors', async () => {
    const readError = Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' })
    mockGetObject.mockImplementation(() => ({ promise: () => Promise.reject(readError) }))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getActiveGuidelinesStrict()).rejects.toThrow(/failed to read guidelines object/i)
    await expect(getActiveGuidelines()).resolves.toEqual(getDefaultGuidelines())

    errorSpy.mockRestore()
  })

  test('strict runtime reads do not reseed when state references a missing active version', async () => {
    objects.set('guidelines/state.json', {
      activeVersion: 'v404',
      draft: null,
      versions: [
        {
          version: 'v404',
          activatedAt: '2026-08-01T10:00:00.000Z',
          activatedBy: 'Elena',
        },
      ],
      activations: [],
      updatedAt: '2026-08-01T10:00:00.000Z',
    })

    await expect(getActiveGuidelinesStrict()).rejects.toMatchObject({
      code: 'ACTIVE_GUIDELINES_UNAVAILABLE',
    })
    expect(objects.has('guidelines/versions/mvp-default-v1.json')).toBe(false)
    expect(objects.get('guidelines/state.json').activeVersion).toBe('v404')
  })

  test('create → save → activate publishes a new immutable version', async () => {
    await getActiveGuidelines()

    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    expect(created.draft.id).toMatch(/^draft_/)
    expect(created.draft.document.version).toBe('mvp-default-v1')

    const edited = {
      ...created.draft.document,
      global: 'Voz actualizada para pruebas.',
    }
    const saved = await saveGuidelineDraft(created.draft.id, edited, {
      updatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })
    expect(saved.draft.document.global).toContain('actualizada')
    expect(saved.draft.revision).toBe(2)

    const activated = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: saved.draft.revision,
    })
    expect(activated.active.version).toBe('v2')
    expect(activated.active.global).toContain('actualizada')
    expect(activated.idempotent).toBe(false)

    const versions = await listGuidelineVersions()
    expect(versions[0]).toMatchObject({ version: 'v2', status: 'active' })
    expect(versions.some((v) => v.version === 'mvp-default-v1' && v.status === 'historical')).toBe(
      true
    )

    // Published version object is immutable on disk.
    expect(objects.get('guidelines/versions/v2.json').global).toContain('actualizada')
    expect(objects.get('guidelines/versions/mvp-default-v1.json').version).toBe('mvp-default-v1')
    const publishedPut = mockPutObject.mock.calls.find(
      ([request]) => request.Key === 'guidelines/versions/v2.json'
    )
    expect(publishedPut?.[0].IfNoneMatch).toBe('*')
  })

  test('concurrent draft creation cannot overwrite the winning draft pointer', async () => {
    await getActiveGuidelines()
    const normalPut = mockPutObject.getMockImplementation()
    let injected = false
    mockPutObject.mockImplementation((request) => {
      if (request.Key === 'guidelines/state.json' && !injected) {
        injected = true
        const current = objects.get('guidelines/state.json')
        objects.set('guidelines/state.json', {
          ...current,
          draft: {
            id: 'draft_concurrent_winner',
            basedOn: current.activeVersion,
            revision: 1,
            updatedAt: '2026-08-01T11:00:00.000Z',
            updatedBy: 'Marco',
          },
          updatedAt: '2026-08-01T11:00:00.000Z',
        })
      }
      return normalPut(request)
    })

    await expect(createGuidelineDraft({ createdBy: 'Elena' })).rejects.toMatchObject({
      code: 'DRAFT_EXISTS',
    })
    expect(objects.get('guidelines/state.json').draft.id).toBe('draft_concurrent_winner')
  })

  test('create, save and discard commit safely and retain every audit event during an outage', async () => {
    await getActiveGuidelines()
    const restoreAudit = makeAuditUnavailable()
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const saved = await saveGuidelineDraft(
      created.draft.id,
      { ...created.draft.document, global: 'Cambio durante indisponibilidad de audit.' },
      { updatedBy: 'Elena', expectedRevision: created.draft.revision }
    )
    await expect(
      discardGuidelineDraft(created.draft.id, { discardedBy: 'Elena' })
    ).resolves.toBeTruthy()

    expect(saved.draft.revision).toBe(2)
    expect(objects.get('guidelines/state.json').draft).toBeNull()
    expect(
      objects.get('guidelines/state.json').pendingAuditEvents.map(({ action }) => action)
    ).toEqual(['created_draft', 'saved', 'discarded_draft'])

    restoreAudit()
    await getActiveGuidelines()

    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([])
    const repairedEvents = objects
      .get('guidelines/audit.json')
      .events.filter(({ by }) => by === 'Elena')
    expect(repairedEvents.filter(({ action }) => action === 'created_draft')).toHaveLength(1)
    expect(repairedEvents.filter(({ action }) => action === 'saved')).toHaveLength(1)
    expect(repairedEvents.filter(({ action }) => action === 'discarded_draft')).toHaveLength(1)

    errorSpy.mockRestore()
  })

  test('audit CAS retry preserves a concurrently appended event', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const normalPut = mockPutObject.getMockImplementation()
    let injected = false
    mockPutObject.mockImplementation((request) => {
      if (request.Key === 'guidelines/audit.json' && !injected) {
        injected = true
        const current = objects.get('guidelines/audit.json')
        objects.set('guidelines/audit.json', {
          ...current,
          events: [
            {
              id: 'concurrent-audit-event',
              action: 'rollback',
              version: 'external-v1',
              at: '2026-08-01T12:10:00.000Z',
              by: 'Marco',
              detail: 'Evento concurrente',
            },
            ...current.events,
          ],
          updatedAt: '2026-08-01T12:10:00.000Z',
        })
      }
      return normalPut(request)
    })

    await saveGuidelineDraft(
      created.draft.id,
      { ...created.draft.document, global: 'Guardado junto a otro evento.' },
      { updatedBy: 'Elena', expectedRevision: created.draft.revision }
    )

    const events = objects.get('guidelines/audit.json').events
    expect(events.filter(({ id }) => id === 'concurrent-audit-event')).toHaveLength(1)
    expect(events.filter(({ action, by }) => action === 'saved' && by === 'Elena')).toHaveLength(1)
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([])
  })

  test('allows an incomplete draft save but blocks strict activation', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const incomplete = { ...created.draft.document, global: '' }

    const saved = await saveGuidelineDraft(created.draft.id, incomplete, {
      updatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })

    expect(saved.draft.revision).toBe(2)
    expect(saved.draft.document.global).toBe('')
    await expect(
      activateGuidelineVersion(created.draft.id, {
        activatedBy: 'Elena',
        expectedRevision: saved.draft.revision,
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'mvp-default-v1',
      draft: { id: created.draft.id, revision: 2 },
    })
  })

  test('rejects a stale expectedRevision without overwriting the current draft', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const firstSave = await saveGuidelineDraft(
      created.draft.id,
      { ...created.draft.document, global: 'Primera edición.' },
      { updatedBy: 'Elena', expectedRevision: created.draft.revision }
    )

    await expect(
      saveGuidelineDraft(
        created.draft.id,
        { ...created.draft.document, global: 'Edición obsoleta.' },
        { updatedBy: 'Marco', expectedRevision: created.draft.revision }
      )
    ).rejects.toMatchObject({ code: 'DRAFT_CONFLICT' })

    expect(firstSave.draft.revision).toBe(2)
    expect(
      objects.get(`guidelines/drafts/${created.draft.id}/revisions/2.json`).document.global
    ).toBe('Primera edición.')
    expect(objects.has(`guidelines/drafts/${created.draft.id}/revisions/3.json`)).toBe(false)
  })

  test('save retries its state CAS without reverting a concurrent active pointer change', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const concurrentVersion = {
      ...clone(getDefaultGuidelines()),
      version: 'v-concurrent',
    }
    objects.set('guidelines/versions/v-concurrent.json', concurrentVersion)

    const normalPut = mockPutObject.getMockImplementation()
    let injected = false
    mockPutObject.mockImplementation((request) => {
      const body = request.Key === 'guidelines/state.json' ? JSON.parse(request.Body) : null
      if (body?.draft?.revision === 2 && !injected) {
        injected = true
        const current = objects.get('guidelines/state.json')
        objects.set('guidelines/state.json', {
          ...current,
          activeVersion: 'v-concurrent',
          versions: [
            {
              version: 'v-concurrent',
              activatedAt: '2026-08-01T12:00:00.000Z',
              activatedBy: 'Marco',
            },
            ...current.versions,
          ],
          updatedAt: '2026-08-01T12:00:00.000Z',
        })
      }
      return normalPut(request)
    })

    const saved = await saveGuidelineDraft(
      created.draft.id,
      { ...created.draft.document, global: 'Edición concurrente segura.' },
      { updatedBy: 'Elena', expectedRevision: created.draft.revision }
    )

    expect(saved.draft.revision).toBe(2)
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'v-concurrent',
      draft: { id: created.draft.id, revision: 2 },
    })
  })

  test('activation retry is idempotent and does not create another version', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })

    const first = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })
    const storedVersion = clone(objects.get('guidelines/versions/v2.json'))
    const versionPutsBeforeRetry = mockPutObject.mock.calls.filter(
      ([request]) => request.Key === 'guidelines/versions/v2.json'
    ).length

    const retry = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })

    expect(first).toMatchObject({ idempotent: false, active: { version: 'v2' } })
    expect(retry).toMatchObject({ idempotent: true, active: { version: 'v2' } })
    expect(objects.get('guidelines/versions/v2.json')).toEqual(storedVersion)
    expect(
      mockPutObject.mock.calls.filter(([request]) => request.Key === 'guidelines/versions/v2.json')
    ).toHaveLength(versionPutsBeforeRetry)
    expect(
      objects.get('guidelines/state.json').versions.filter(({ version }) => version === 'v2')
    ).toHaveLength(1)
  })

  test('activation and rollback retries repair durable audit events without duplicates', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const restoreActivationAudit = makeAuditUnavailable()
    const activated = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })
    expect(activated).toMatchObject({ idempotent: false, active: { version: 'v2' } })
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([
      expect.objectContaining({ action: 'activated', version: 'v2' }),
    ])

    restoreActivationAudit()
    const activationRetry = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })
    expect(activationRetry.idempotent).toBe(true)
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([])
    expect(
      objects
        .get('guidelines/audit.json')
        .events.filter(({ action, version }) => action === 'activated' && version === 'v2')
    ).toHaveLength(1)

    const restoreRollbackAudit = makeAuditUnavailable()
    await expect(
      rollbackGuidelineVersion('mvp-default-v1', { rolledBackBy: 'Marco' })
    ).resolves.toMatchObject({ active: { version: 'mvp-default-v1' } })
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([
      expect.objectContaining({ action: 'rollback', version: 'mvp-default-v1' }),
    ])

    restoreRollbackAudit()
    await expect(
      rollbackGuidelineVersion('mvp-default-v1', { rolledBackBy: 'Marco' })
    ).rejects.toMatchObject({ code: 'ALREADY_ACTIVE' })
    expect(objects.get('guidelines/state.json').pendingAuditEvents).toEqual([])
    expect(
      objects
        .get('guidelines/audit.json')
        .events.filter(
          ({ action, version }) => action === 'rollback' && version === 'mvp-default-v1'
        )
    ).toHaveLength(1)

    errorSpy.mockRestore()
  })

  test('concurrent activation resolves through one state CAS and one idempotent result', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })

    const results = await Promise.all([
      activateGuidelineVersion(created.draft.id, {
        activatedBy: 'Elena',
        expectedRevision: created.draft.revision,
      }),
      activateGuidelineVersion(created.draft.id, {
        activatedBy: 'Elena',
        expectedRevision: created.draft.revision,
      }),
    ])

    expect(results.map(({ idempotent }) => idempotent).sort()).toEqual([false, true])
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'v2',
      draft: null,
    })
    expect(
      objects.get('guidelines/state.json').versions.filter(({ version }) => version === 'v2')
    ).toHaveLength(1)
    expect(
      objects
        .get('guidelines/state.json')
        .activations.filter(({ draftId }) => draftId === created.draft.id)
    ).toHaveLength(1)
    expect(
      objects
        .get('guidelines/audit.json')
        .events.filter(({ action, version }) => action === 'activated' && version === 'v2')
    ).toHaveLength(1)
  })

  test('activation cleans an uncommitted version after losing state CAS and can retry', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const normalPut = mockPutObject.getMockImplementation()
    let injected = false
    mockPutObject.mockImplementation((request) => {
      const body = request.Key === 'guidelines/state.json' ? JSON.parse(request.Body) : null
      if (body?.activeVersion === 'v2' && !injected) {
        injected = true
        const current = objects.get('guidelines/state.json')
        const revisionTwo = {
          ...objects.get(`guidelines/drafts/${created.draft.id}/revisions/1.json`),
          document: {
            ...created.draft.document,
            global: 'Edición que ganó la carrera.',
          },
          revision: 2,
          updatedAt: '2026-08-01T12:30:00.000Z',
          updatedBy: 'Marco',
        }
        objects.set(`guidelines/drafts/${created.draft.id}/revisions/2.json`, revisionTwo)
        objects.set('guidelines/state.json', {
          ...current,
          draft: {
            ...current.draft,
            revision: 2,
            updatedAt: revisionTwo.updatedAt,
            updatedBy: revisionTwo.updatedBy,
          },
          updatedAt: revisionTwo.updatedAt,
        })
      }
      return normalPut(request)
    })

    await expect(
      activateGuidelineVersion(created.draft.id, {
        activatedBy: 'Elena',
        expectedRevision: created.draft.revision,
      })
    ).rejects.toMatchObject({ code: 'DRAFT_CONFLICT' })
    expect(objects.has('guidelines/versions/v2.json')).toBe(false)
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'mvp-default-v1',
      draft: { id: created.draft.id, revision: 2 },
    })

    const retried = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Marco',
      expectedRevision: 2,
    })
    expect(retried).toMatchObject({
      idempotent: false,
      active: { version: 'v2', global: 'Edición que ganó la carrera.' },
    })
  })

  test('never overwrites an occupied immutable published version', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const occupied = {
      ...clone(getDefaultGuidelines()),
      version: 'v2',
      global: 'Versión publicada por otra activación.',
      sourceDraftId: 'draft_other',
      sourceDraftRevision: 7,
    }
    objects.set('guidelines/versions/v2.json', clone(occupied))

    const activated = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })

    expect(objects.get('guidelines/versions/v2.json')).toEqual(occupied)
    expect(activated.active.version).toBe('v3')
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'v3',
      draft: null,
    })
  })

  test('activation fails closed when its declared base version is missing', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    objects.delete('guidelines/versions/mvp-default-v1.json')

    await expect(
      activateGuidelineVersion(created.draft.id, {
        activatedBy: 'Elena',
        expectedRevision: created.draft.revision,
      })
    ).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' })

    expect(objects.has('guidelines/versions/v2.json')).toBe(false)
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'mvp-default-v1',
      draft: { id: created.draft.id, revision: 1 },
    })
  })

  test('published technical IDs stay reserved after rollback', async () => {
    await getActiveGuidelines()
    const originalDraft = await createGuidelineDraft({ createdBy: 'Elena' })
    const withHistoricalType = duplicateContentType(originalDraft.draft.document, 'caption', {
      id: 'historical_campaign',
      label: 'Campaña histórica',
    })
    const savedOriginal = await saveGuidelineDraft(originalDraft.draft.id, withHistoricalType, {
      updatedBy: 'Elena',
      expectedRevision: originalDraft.draft.revision,
    })
    const firstPublished = await activateGuidelineVersion(originalDraft.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: savedOriginal.draft.revision,
    })
    const historicalEntry = clone(
      firstPublished.active.contentTypeCatalog.find(({ id }) => id === 'historical_campaign')
    )
    const laterDraft = await createGuidelineDraft({ createdBy: 'Elena' })
    const withLaterType = duplicateContentType(laterDraft.draft.document, 'regular_post', {
      id: 'later_series',
      label: 'Serie posterior',
    })
    const savedLater = await saveGuidelineDraft(laterDraft.draft.id, withLaterType, {
      updatedBy: 'Elena',
      expectedRevision: laterDraft.draft.revision,
    })
    const laterPublished = await activateGuidelineVersion(laterDraft.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: savedLater.draft.revision,
    })
    const laterEntry = clone(
      laterPublished.active.contentTypeCatalog.find(({ id }) => id === 'later_series')
    )
    await rollbackGuidelineVersion('mvp-default-v1', { rolledBackBy: 'Marco' })

    const rollbackDraft = await createGuidelineDraft({ createdBy: 'Marco' })
    expect(
      rollbackDraft.draft.document.contentTypeCatalog.find(({ id }) => id === 'historical_campaign')
    ).toMatchObject({ label: 'Campaña histórica', status: 'archived' })
    expect(
      rollbackDraft.draft.document.contentTypeCatalog.find(({ id }) => id === 'later_series')
    ).toMatchObject({ label: 'Serie posterior', status: 'archived' })

    const missingHistory = {
      ...rollbackDraft.draft.document,
      contentTypeCatalog: rollbackDraft.draft.document.contentTypeCatalog.filter(
        ({ id }) => !['historical_campaign', 'later_series'].includes(id)
      ),
    }
    const savedMissing = await saveGuidelineDraft(rollbackDraft.draft.id, missingHistory, {
      updatedBy: 'Marco',
      expectedRevision: rollbackDraft.draft.revision,
    })
    await expect(
      activateGuidelineVersion(rollbackDraft.draft.id, {
        activatedBy: 'Marco',
        expectedRevision: savedMissing.draft.revision,
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: expect.arrayContaining([
        expect.stringMatching(/historical_campaign.*conservarse o archivarse/i),
        expect.stringMatching(/later_series.*conservarse o archivarse/i),
      ]),
    })

    const reusedId = duplicateContentType(savedMissing.draft.document, 'regular_post', {
      id: 'historical_campaign',
      label: 'Otro propósito',
    })
    const savedReuse = await saveGuidelineDraft(rollbackDraft.draft.id, reusedId, {
      updatedBy: 'Marco',
      expectedRevision: savedMissing.draft.revision,
    })

    await expect(
      activateGuidelineVersion(rollbackDraft.draft.id, {
        activatedBy: 'Marco',
        expectedRevision: savedReuse.draft.revision,
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: expect.arrayContaining([expect.stringMatching(/historical_campaign.*reservado/i)]),
    })
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'mvp-default-v1',
      draft: { id: rollbackDraft.draft.id, revision: 3 },
    })
    expect(objects.has('guidelines/versions/v4.json')).toBe(false)

    const preservedHistory = {
      ...savedReuse.draft.document,
      contentTypeCatalog: savedReuse.draft.document.contentTypeCatalog
        .map((entry) =>
          entry.id === 'historical_campaign' ? { ...historicalEntry, status: 'archived' } : entry
        )
        .concat({ ...laterEntry, status: 'archived' }),
    }
    const savedHistory = await saveGuidelineDraft(rollbackDraft.draft.id, preservedHistory, {
      updatedBy: 'Marco',
      expectedRevision: savedReuse.draft.revision,
    })
    const republished = await activateGuidelineVersion(rollbackDraft.draft.id, {
      activatedBy: 'Marco',
      expectedRevision: savedHistory.draft.revision,
    })

    expect(republished.active.version).toBe('v4')
    expect(
      republished.active.contentTypeCatalog.find(({ id }) => id === 'historical_campaign')
    ).toMatchObject({ label: 'Campaña histórica', status: 'archived' })
    expect(
      republished.active.contentTypeCatalog.find(({ id }) => id === 'later_series')
    ).toMatchObject({ label: 'Serie posterior', status: 'archived' })
  })

  test('audits content type creation and archival during activation', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const edited = duplicateContentType(created.draft.document, 'caption', {
      id: 'community_caption',
      label: 'Caption comunitario',
      archiveOriginal: true,
    })
    const saved = await saveGuidelineDraft(created.draft.id, edited, {
      updatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })
    const activated = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: saved.draft.revision,
    })

    expect(activated.diff.created).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'community_caption' })])
    )
    expect(activated.diff.archived).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'caption' })])
    )
    expect(activated.auditLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'created_content_type' }),
        expect.objectContaining({ action: 'archived_content_type' }),
      ])
    )
  })

  test('activate and discard succeed even if DeleteObject fails', async () => {
    await getActiveGuidelines()
    mockDeleteObject.mockImplementation(() => ({
      promise: () =>
        Promise.reject(Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' })),
    }))

    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const activated = await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: created.draft.revision,
    })
    expect(activated.active.version).toBe('v2')
    expect(objects.get('guidelines/state.json').draft).toBeNull()
    expect(objects.get('guidelines/state.json').activeVersion).toBe('v2')

    const created2 = await createGuidelineDraft({ createdBy: 'Elena' })
    const discarded = await discardGuidelineDraft(created2.draft.id, { discardedBy: 'Elena' })
    expect(discarded.auditLog[0].action).toBe('discarded_draft')
    expect(objects.get('guidelines/state.json').draft).toBeNull()

    const statePuts = conditionalWrites.filter(({ Key }) => Key === 'guidelines/state.json')
    expect(statePuts.every(({ ifMatch, ifNoneMatch }) => Boolean(ifMatch || ifNoneMatch))).toBe(
      true
    )
  })

  test('rollback retries state CAS and preserves a concurrent draft revision', async () => {
    await getActiveGuidelines()
    const publishedDraft = await createGuidelineDraft({ createdBy: 'Elena' })
    await activateGuidelineVersion(publishedDraft.draft.id, {
      activatedBy: 'Elena',
      expectedRevision: publishedDraft.draft.revision,
    })
    const currentDraft = await createGuidelineDraft({ createdBy: 'Marco' })

    const normalPut = mockPutObject.getMockImplementation()
    let injected = false
    mockPutObject.mockImplementation((request) => {
      const body = request.Key === 'guidelines/state.json' ? JSON.parse(request.Body) : null
      if (body?.activeVersion === 'mvp-default-v1' && !injected) {
        injected = true
        const current = objects.get('guidelines/state.json')
        const revisionTwo = {
          ...objects.get(`guidelines/drafts/${currentDraft.draft.id}/revisions/1.json`),
          revision: 2,
          updatedAt: '2026-08-01T13:00:00.000Z',
          updatedBy: 'Elena',
        }
        objects.set(`guidelines/drafts/${currentDraft.draft.id}/revisions/2.json`, revisionTwo)
        objects.set('guidelines/state.json', {
          ...current,
          draft: {
            ...current.draft,
            revision: 2,
            updatedAt: revisionTwo.updatedAt,
            updatedBy: revisionTwo.updatedBy,
          },
          updatedAt: revisionTwo.updatedAt,
        })
      }
      return normalPut(request)
    })

    await expect(
      rollbackGuidelineVersion('mvp-default-v1', { rolledBackBy: 'Marco' })
    ).resolves.toMatchObject({ active: { version: 'mvp-default-v1' } })
    expect(objects.get('guidelines/state.json')).toMatchObject({
      activeVersion: 'mvp-default-v1',
      draft: { id: currentDraft.draft.id, revision: 2 },
    })
  })

  test('migrates a stored v1 document in memory and rolls back without rewriting it', async () => {
    const legacy = legacyV1Document()
    objects.set('guidelines/versions/mvp-default-v1.json', clone(legacy))
    objects.set('guidelines/state.json', {
      activeVersion: 'mvp-default-v1',
      draft: null,
      versions: [
        {
          version: 'mvp-default-v1',
          activatedAt: '2026-07-01T00:00:00.000Z',
          activatedBy: 'system',
        },
      ],
      activations: [],
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    const activeLegacy = await getActiveGuidelines()
    expect(activeLegacy.schemaVersion).toBe(GUIDELINES_SCHEMA_VERSION)
    expect(activeLegacy.contentTypeCatalog[0].id).toBe('observation_night')
    expect(objects.get('guidelines/versions/mvp-default-v1.json')).toEqual(legacy)

    const created = await createGuidelineDraft({ createdBy: 'Marco' })
    expect(created.draft.document.schemaVersion).toBe(GUIDELINES_SCHEMA_VERSION)
    await activateGuidelineVersion(created.draft.id, {
      activatedBy: 'Marco',
      expectedRevision: created.draft.revision,
    })

    const before = clone(objects.get('guidelines/versions/mvp-default-v1.json'))
    const rolled = await rollbackGuidelineVersion('mvp-default-v1', { rolledBackBy: 'Marco' })
    expect(rolled.active.version).toBe('mvp-default-v1')
    expect(rolled.active.schemaVersion).toBe(GUIDELINES_SCHEMA_VERSION)
    expect(rolled.active.contentTypeCatalog[0].id).toBe('observation_night')
    expect(objects.get('guidelines/versions/mvp-default-v1.json')).toEqual(before)

    const versions = await listGuidelineVersions()
    expect(versions.find((v) => v.version === 'mvp-default-v1')?.status).toBe('active')
  })

  test('migrates stored v2 platform rules in memory without rewriting the version', async () => {
    const storedV2 = clone(getDefaultGuidelines())
    storedV2.schemaVersion = 2
    storedV2.platforms.x = 'Revisar la expectativa anterior de X.'
    storedV2.generation.platforms = { x: 'Generar la expectativa anterior de X.' }
    objects.set('guidelines/versions/mvp-default-v1.json', clone(storedV2))
    objects.set('guidelines/state.json', {
      activeVersion: 'mvp-default-v1',
      draft: null,
      versions: [{ version: 'mvp-default-v1' }],
      activations: [],
    })

    const active = await getActiveGuidelines()

    expect(active.schemaVersion).toBe(GUIDELINES_SCHEMA_VERSION)
    expect(active.generation.platforms).toBeUndefined()
    expect(active.platforms.x).toContain('Generar la expectativa anterior de X.')
    expect(active.platforms.x).toContain('Revisar la expectativa anterior de X.')
    expect(objects.get('guidelines/versions/mvp-default-v1.json')).toEqual(storedV2)
  })
})

describe('guidelines-store without bucket', () => {
  beforeEach(() => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
  })

  test('getActiveGuidelines returns defaults', async () => {
    const active = await getActiveGuidelines()
    expect(active).toEqual(getDefaultGuidelines())
    await expect(getActiveGuidelinesStrict()).resolves.toEqual(getDefaultGuidelines())
  })
})
