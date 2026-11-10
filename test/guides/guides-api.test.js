/**
 * @jest-environment node
 */
// POST /api/admin/guides and PUT /api/admin/guides/[slug]: manual entry validation

jest.mock('../../auth', () => ({ auth: (handler) => handler }))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}))

jest.mock('../../lib/google-sheets', () => ({ getMemberByEmail: jest.fn() }))

jest.mock('../../lib/permissions', () => {
  const actual = jest.requireActual('../../lib/permissions')
  return { ...actual, canPerformAction: jest.fn(() => true) }
})

jest.mock('@/lib/guides', () => ({
  listGuides: jest.fn(),
  createGuide: jest.fn(async (data) => ({ slug: 'g-1', ...data })),
  getGuide: jest.fn(),
  updateGuide: jest.fn(async (slug, updates) => ({ slug, ...updates })),
  deleteGuide: jest.fn(),
}))

import { createGuide, updateGuide } from '@/lib/guides'
import { POST } from '../../app/api/admin/guides/route'
import { PUT } from '../../app/api/admin/guides/[slug]/route'

const env = { ...process.env }
const ADMIN = { email: 'guias@example.com' }
const req = (body) => ({ auth: { user: ADMIN }, json: async () => body })
const params = Promise.resolve({ slug: 'g-1' })

const catalogEntry = { objectId: 'NGC0224', difficulty: 'facil' }
const manualEntry = (manual) => ({ objectId: 'manual-a1', manual, notes: '' })

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.S3_STUB_DIR
})

afterEach(() => {
  process.env = { ...env }
})

describe('POST /api/admin/guides', () => {
  test('saves cleaned manual entries', async () => {
    const res = await POST(
      req({
        title: 'Noviembre',
        type: 'objects',
        entries: [catalogEntry, manualEntry({ name: ' Saturno ', magnitude: '0.6' })],
      })
    )
    expect(res.status).toBe(201)
    expect(createGuide).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [catalogEntry, manualEntry({ name: 'Saturno', magnitude: 0.6 })],
      })
    )
  })

  test('returns 400 for an invalid manual entry and saves nothing', async () => {
    const res = await POST(
      req({ title: 'Noviembre', type: 'objects', entries: [manualEntry({ name: '' })] })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/^Objeto manual 1 inválido/)
    expect(createGuide).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/guides/[slug]', () => {
  test('saves cleaned manual entries', async () => {
    const res = await PUT(req({ entries: [manualEntry({ name: 'Luna', ra: '', dec: '' })] }), {
      params,
    })
    expect(res.status).toBe(200)
    expect(updateGuide).toHaveBeenCalledWith('g-1', {
      entries: [manualEntry({ name: 'Luna' })],
    })
  })

  test('leaves the body alone when entries are omitted', async () => {
    const res = await PUT(req({ title: 'Nuevo' }), { params })
    expect(res.status).toBe(200)
    expect(updateGuide).toHaveBeenCalledWith('g-1', { title: 'Nuevo' })
  })

  test('returns 400 for an invalid manual entry', async () => {
    const res = await PUT(
      req({ entries: [manualEntry({ name: 'X', imageUrl: 'http://a.com/x.jpg' })] }),
      { params }
    )
    expect(res.status).toBe(400)
    expect(updateGuide).not.toHaveBeenCalled()
  })

  test('accepts local stub images only in stub mode', async () => {
    const body = {
      entries: [manualEntry({ name: 'X', imageUrl: '/local-s3/images/guides/a.jpg' })],
    }

    expect((await PUT(req(body), { params })).status).toBe(400)

    process.env.S3_STUB_DIR = '.local-s3'
    expect((await PUT(req(body), { params })).status).toBe(200)
  })
})
