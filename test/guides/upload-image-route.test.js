/**
 * @jest-environment node
 */
// POST /api/admin/guides/upload-image: auth, guide permission, upload result

jest.mock('../../auth', () => ({ auth: (handler) => handler }))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}))

// lib/api-permissions.js pulls in lib/google-sheets.js, which loads an ESM-only package.
jest.mock('../../lib/google-sheets', () => ({ getMemberByEmail: jest.fn() }))

jest.mock('../../lib/permissions', () => {
  const actual = jest.requireActual('../../lib/permissions')
  return { ...actual, canPerformAction: jest.fn() }
})

jest.mock('../../lib/image-upload', () => ({ uploadPublicImage: jest.fn() }))

import { canPerformAction, Actions } from '../../lib/permissions'
import { uploadPublicImage } from '../../lib/image-upload'
import { POST } from '../../app/api/admin/guides/upload-image/route'

const ADMIN = { email: 'guias@example.com' }
const file = { name: 'a.jpg', type: 'image/jpeg', size: 10 }
const reqWith = (user) => ({
  auth: user ? { user } : null,
  formData: async () => ({ get: () => file }),
})

beforeEach(() => {
  jest.clearAllMocks()
  canPerformAction.mockReturnValue(true)
  uploadPublicImage.mockResolvedValue({ ok: true, url: 'https://x/a.jpg', key: 'k' })
})

test('returns 401 without a session', async () => {
  const res = await POST(reqWith(null))
  expect(res.status).toBe(401)
  expect(uploadPublicImage).not.toHaveBeenCalled()
})

test('returns 403 without create or edit guide permission', async () => {
  canPerformAction.mockReturnValue(false)
  const res = await POST(reqWith(ADMIN))
  expect(res.status).toBe(403)
  expect(canPerformAction).toHaveBeenCalledWith(ADMIN.email, Actions.CREATE_GUIDE)
  expect(canPerformAction).toHaveBeenCalledWith(ADMIN.email, Actions.EDIT_GUIDE)
  expect(uploadPublicImage).not.toHaveBeenCalled()
})

test('accepts edit permission alone', async () => {
  canPerformAction.mockImplementation((_, action) => action === Actions.EDIT_GUIDE)
  const res = await POST(reqWith(ADMIN))
  expect(res.status).toBe(200)
})

test('uploads under images/guides with a unique name', async () => {
  const res = await POST(reqWith(ADMIN))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ url: 'https://x/a.jpg', key: 'k' })
  expect(uploadPublicImage).toHaveBeenCalledWith(file, {
    keyPrefix: 'images/guides',
    uniqueName: true,
  })
})

test('passes an upload error through with its status', async () => {
  uploadPublicImage.mockResolvedValue({
    ok: false,
    status: 400,
    error: 'El archivo debe ser una imagen',
  })
  const res = await POST(reqWith(ADMIN))
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'El archivo debe ser una imagen' })
})

test('returns 500 when the upload throws', async () => {
  uploadPublicImage.mockRejectedValue(new Error('S3 down'))
  const res = await POST(reqWith(ADMIN))
  expect(res.status).toBe(500)
})
