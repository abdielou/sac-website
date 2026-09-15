/**
 * @jest-environment node
 */

jest.mock('../../auth', () => ({
  auth: (handler) => handler,
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status || 200, body }),
  },
}))

jest.mock('../../lib/api-permissions', () => ({
  checkPermission: jest.fn(() => null),
}))

jest.mock('../../lib/guidelines-store', () => ({
  saveGuidelineDraft: jest.fn(),
  discardGuidelineDraft: jest.fn(),
}))

import {
  MAX_GUIDELINE_CONTENT_TYPES,
  MAX_GUIDELINE_DOCUMENT_DEPTH,
  MAX_GUIDELINE_DRAFT_BODY_BYTES,
  MAX_GUIDELINE_LIST_ITEMS,
  MAX_GUIDELINE_PLATFORMS,
  MAX_GUIDELINE_TEXT_LENGTH,
} from '../../lib/ai-constants'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { GUIDELINES_SCHEMA_VERSION, validateGuidelineDraft } from '../../lib/ai-guidelines-schema'
import { saveGuidelineDraft } from '../../lib/guidelines-store'
import { PUT } from '../../app/api/admin/ai/guidelines/drafts/[id]/route'

function request(body, { contentLength } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    auth: { user: { id: 'u1', email: 'user@example.com', name: 'Editor' } },
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-length') {
          return contentLength === undefined ? String(Buffer.byteLength(text)) : contentLength
        }
        return null
      },
    },
    text: async () => text,
  }
}

describe('validateGuidelineDraft bounds', () => {
  test('accepts the default seed and a partially filled draft', () => {
    expect(validateGuidelineDraft(getDefaultGuidelines()).ok).toBe(true)
    expect(
      validateGuidelineDraft({ schemaVersion: GUIDELINES_SCHEMA_VERSION, global: 'Borrador' }).ok
    ).toBe(true)
  })

  test('rejects a string longer than the activation maximum', () => {
    const result = validateGuidelineDraft({
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      global: 'x'.repeat(MAX_GUIDELINE_TEXT_LENGTH + 1),
    })

    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatchObject({ code: 'max_length', path: 'global' })
  })

  test('rejects nested strings and oversized lists anywhere in the document', () => {
    const nested = validateGuidelineDraft({
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      contentTypeCatalog: [{ id: 'evento', validation: { rules: 'x'.repeat(50_000) } }],
    })
    expect(nested.issues[0]).toMatchObject({
      code: 'max_length',
      path: 'contentTypeCatalog.0.validation.rules',
    })

    const list = validateGuidelineDraft({
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      contentTypeCatalog: [{ id: 'evento', fields: Array(MAX_GUIDELINE_LIST_ITEMS + 1).fill({}) }],
    })
    expect(list.issues[0]).toMatchObject({
      code: 'max_length',
      path: 'contentTypeCatalog.0.fields',
    })
  })

  test('caps the content type catalog and the platform count at draft time', () => {
    const catalog = validateGuidelineDraft({
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      contentTypeCatalog: Array.from({ length: MAX_GUIDELINE_CONTENT_TYPES + 1 }, (_, i) => ({
        id: `tipo_${i}`,
      })),
    })
    expect(catalog.issues[0]).toMatchObject({ code: 'max_length', path: 'contentTypeCatalog' })

    const platforms = validateGuidelineDraft({
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      platforms: Object.fromEntries(
        Array.from({ length: MAX_GUIDELINE_PLATFORMS + 1 }, (_, i) => [`p${i}`, 'x'])
      ),
    })
    expect(platforms.issues[0]).toMatchObject({ code: 'max_length', path: 'platforms' })
  })

  test('rejects documents that are too deep or hold too many values', () => {
    let deep = 'leaf'
    for (let level = 0; level <= MAX_GUIDELINE_DOCUMENT_DEPTH; level += 1) deep = { deep }
    expect(
      validateGuidelineDraft({ schemaVersion: GUIDELINES_SCHEMA_VERSION, deep }).issues[0]
    ).toMatchObject({
      code: 'max_depth',
    })

    const wide = {
      schemaVersion: GUIDELINES_SCHEMA_VERSION,
      contentTypeCatalog: Array.from({ length: 40 }, () => ({
        fields: Array.from({ length: 150 }, () => ({ key: 'k' })),
      })),
    }
    expect(validateGuidelineDraft(wide).issues[0]).toMatchObject({ code: 'max_size' })
  })
})

describe('PUT /api/admin/ai/guidelines/drafts/[id] body cap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    saveGuidelineDraft.mockResolvedValue({ draft: { id: 'draft_1', revision: 2 }, auditLog: [] })
  })

  test('refuses a body whose declared length exceeds the cap without reading it', async () => {
    const req = request(
      { document: {}, expectedRevision: 1 },
      {
        contentLength: String(MAX_GUIDELINE_DRAFT_BODY_BYTES + 1),
      }
    )
    req.text = jest.fn()

    const response = await PUT(req, { params: Promise.resolve({ id: 'draft_1' }) })

    expect(response.status).toBe(413)
    expect(req.text).not.toHaveBeenCalled()
    expect(saveGuidelineDraft).not.toHaveBeenCalled()
  })

  test('refuses an oversized body even when content-length is missing', async () => {
    const text = JSON.stringify({
      document: { global: 'x'.repeat(MAX_GUIDELINE_DRAFT_BODY_BYTES) },
      expectedRevision: 1,
    })

    const response = await PUT(request(text, { contentLength: null }), {
      params: Promise.resolve({ id: 'draft_1' }),
    })

    expect(response.status).toBe(413)
    expect(saveGuidelineDraft).not.toHaveBeenCalled()
  })

  test('answers 400 for malformed JSON and forwards a valid document', async () => {
    const malformed = await PUT(request('{not json', { contentLength: null }), {
      params: Promise.resolve({ id: 'draft_1' }),
    })
    expect(malformed.status).toBe(400)

    const valid = await PUT(request({ document: { schemaVersion: 3 }, expectedRevision: 1 }), {
      params: Promise.resolve({ id: 'draft_1' }),
    })
    expect(valid.status).toBe(200)
    expect(saveGuidelineDraft).toHaveBeenCalledWith(
      'draft_1',
      { schemaVersion: 3 },
      { updatedBy: 'Editor', expectedRevision: 1 }
    )
  })
})
