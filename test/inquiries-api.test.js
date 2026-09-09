// GET /api/admin/inquiries: auth, permission, cache flag, config and upstream errors

jest.mock('../auth', () => ({ auth: (handler) => handler }))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}))

// lib/api-permissions.js pulls in lib/member-access.js, which pulls in
// lib/google-sheets.js, which loads the ESM-only google-spreadsheet package.
jest.mock('../lib/google-sheets', () => ({ getMemberByEmail: jest.fn() }))

jest.mock('../lib/permissions', () => {
  const actual = jest.requireActual('../lib/permissions')
  return { ...actual, hasPermission: jest.fn(), canPerformAction: jest.fn() }
})

jest.mock('../lib/gmail-log', () => {
  const actual = jest.requireActual('../lib/gmail-log')
  return { ...actual, getEmailAccountability: jest.fn() }
})

import { hasPermission } from '../lib/permissions'
import { getEmailAccountability, GmailLogConfigError } from '../lib/gmail-log'
import { GET } from '../app/api/admin/inquiries/route'

const ADMIN = { email: 'admin@example.com' }
const reqWith = (user, search = '') => ({
  auth: user ? { user } : null,
  url: `http://localhost/api/admin/inquiries${search}`,
})

const payload = {
  generatedAt: '2026-09-07T12:00:00.000Z',
  windowDays: 30,
  thresholdDays: 7,
  summary: { overdue: 1, pending: 0, answered: 0 },
  threads: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  hasPermission.mockReturnValue(true)
})

describe('GET /api/admin/inquiries', () => {
  test('returns 401 without a session', async () => {
    const res = await GET(reqWith(null))
    expect(res.status).toBe(401)
    expect(getEmailAccountability).not.toHaveBeenCalled()
  })

  test('returns 403 without read_inquiries', async () => {
    hasPermission.mockReturnValue(false)
    const res = await GET(reqWith(ADMIN))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith(ADMIN.email, 'read_inquiries')
  })

  test('returns the data and the cache flag', async () => {
    getEmailAccountability.mockResolvedValue({ data: payload, fromCache: true })
    const res = await GET(reqWith(ADMIN))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: payload, meta: { fromCache: true } })
    expect(getEmailAccountability).toHaveBeenCalledWith(false)
  })

  test('passes refresh=true through', async () => {
    getEmailAccountability.mockResolvedValue({ data: payload, fromCache: false })
    await GET(reqWith(ADMIN, '?refresh=true'))
    expect(getEmailAccountability).toHaveBeenCalledWith(true)
  })

  test('returns 500 on a missing env var', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    getEmailAccountability.mockRejectedValue(new GmailLogConfigError('EMAIL_GROUP_ADDRESS'))
    const res = await GET(reqWith(ADMIN))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Falta configuración del registro de correo')
    spy.mockRestore()
  })

  test('returns 502 when the Reports API fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    getEmailAccountability.mockRejectedValue(new Error('unauthorized_client'))
    const res = await GET(reqWith(ADMIN))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('Error al leer el registro de correo')
    expect(body.details).toBe('unauthorized_client')
    spy.mockRestore()
  })
})
