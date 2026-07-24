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
import {
  activateGuidelineVersion,
  createGuidelineDraft,
  discardGuidelineDraft,
  getActiveGuidelines,
  listGuidelineVersions,
  nextPublishedVersion,
  rollbackGuidelineVersion,
  saveGuidelineDraft,
  validateGuidelineDocument,
} from '../../lib/guidelines-store'

function okBody(data) {
  return {
    promise: () => Promise.resolve({ Body: Buffer.from(JSON.stringify(data)) }),
  }
}

function notFound() {
  const error = new Error('NoSuchKey')
  error.code = 'NoSuchKey'
  return {
    promise: () => Promise.reject(error),
  }
}

function putOk() {
  return { promise: () => Promise.resolve({}) }
}

function deleteOk() {
  return { promise: () => Promise.resolve({}) }
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

  beforeEach(() => {
    objects = new Map()
    process.env.S3_ARTICLES_BUCKET_NAME = bucket
    process.env.AWS_REGION = 'us-east-1'

    mockGetObject.mockImplementation(({ Key }) => {
      if (!objects.has(Key)) return notFound()
      return okBody(objects.get(Key))
    })
    mockPutObject.mockImplementation(({ Key, Body }) => {
      objects.set(Key, JSON.parse(Body))
      return putOk()
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

  test('getActiveGuidelines seeds defaults when store is empty', async () => {
    const active = await getActiveGuidelines()
    expect(active.version).toBe('mvp-default-v1')
    expect(objects.has('guidelines/meta.json')).toBe(true)
    expect(objects.has('guidelines/versions/mvp-default-v1.json')).toBe(true)
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
    const saved = await saveGuidelineDraft(created.draft.id, edited, { updatedBy: 'Elena' })
    expect(saved.draft.document.global).toContain('actualizada')

    const activated = await activateGuidelineVersion(created.draft.id, { activatedBy: 'Elena' })
    expect(activated.active.version).toBe('v2')
    expect(activated.active.global).toContain('actualizada')

    const versions = await listGuidelineVersions()
    expect(versions[0]).toMatchObject({ version: 'v2', status: 'active' })
    expect(versions.some((v) => v.version === 'mvp-default-v1' && v.status === 'historical')).toBe(
      true
    )

    // Published version object is immutable on disk.
    expect(objects.get('guidelines/versions/v2.json').global).toContain('actualizada')
    expect(objects.get('guidelines/versions/mvp-default-v1.json').version).toBe('mvp-default-v1')
  })

  test('activate and discard succeed even if DeleteObject fails', async () => {
    await getActiveGuidelines()
    mockDeleteObject.mockImplementation(() => ({
      promise: () =>
        Promise.reject(Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' })),
    }))

    const created = await createGuidelineDraft({ createdBy: 'Elena' })
    const activated = await activateGuidelineVersion(created.draft.id, { activatedBy: 'Elena' })
    expect(activated.active.version).toBe('v2')
    expect(objects.get('guidelines/meta.json').draft).toBeNull()
    expect(objects.get('guidelines/meta.json').activeVersion).toBe('v2')

    const created2 = await createGuidelineDraft({ createdBy: 'Elena' })
    const discarded = await discardGuidelineDraft(created2.draft.id, { discardedBy: 'Elena' })
    expect(discarded.auditLog[0].action).toBe('discarded_draft')
    expect(objects.get('guidelines/meta.json').draft).toBeNull()
  })

  test('rollback re-points active without rewriting historical document', async () => {
    await getActiveGuidelines()
    const created = await createGuidelineDraft({ createdBy: 'Marco' })
    await saveGuidelineDraft(
      created.draft.id,
      { ...created.draft.document, global: 'Cambio temporal' },
      { updatedBy: 'Marco' }
    )
    await activateGuidelineVersion(created.draft.id, { activatedBy: 'Marco' })

    const before = objects.get('guidelines/versions/mvp-default-v1.json')
    const rolled = await rollbackGuidelineVersion('mvp-default-v1', { rolledBackBy: 'Marco' })
    expect(rolled.active.version).toBe('mvp-default-v1')
    expect(objects.get('guidelines/versions/mvp-default-v1.json')).toEqual(before)

    const versions = await listGuidelineVersions()
    expect(versions.find((v) => v.version === 'mvp-default-v1')?.status).toBe('active')
  })
})

describe('guidelines-store without bucket', () => {
  beforeEach(() => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
  })

  test('getActiveGuidelines returns defaults', async () => {
    const active = await getActiveGuidelines()
    expect(active).toEqual(getDefaultGuidelines())
  })
})
