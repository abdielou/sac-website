// test/refresh-api.test.js
// POST /api/admin/refresh: auth, permission, and scoped cache invalidation

jest.mock('../auth', () => ({ auth: (handler) => handler }))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}))

jest.mock('../lib/cache', () => ({
  invalidateCache: jest.fn(),
  CACHE_KEYS: { MEMBERS: 'members', PAYMENTS: 'payments', CONTACTS: 'contacts' },
}))

jest.mock('../lib/permissions', () => ({ canAccessDashboard: jest.fn() }))

import { invalidateCache } from '../lib/cache'
import { canAccessDashboard } from '../lib/permissions'
import { POST } from '../app/api/admin/refresh/route'

const ADMIN = { email: 'admin@example.com' }
const reqWith = (user, body) => ({
  auth: user ? { user } : null,
  json: async () => {
    if (body === undefined) throw new Error('no body')
    return body
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  canAccessDashboard.mockReturnValue(true)
})

describe('POST /api/admin/refresh', () => {
  test('returns 401 without a session', async () => {
    const res = await POST(reqWith(null, {}))
    expect(res.status).toBe(401)
    expect(invalidateCache).not.toHaveBeenCalled()
  })

  test('returns 403 without dashboard access', async () => {
    canAccessDashboard.mockReturnValue(false)
    const res = await POST(reqWith(ADMIN, {}))
    expect(res.status).toBe(403)
    expect(invalidateCache).not.toHaveBeenCalled()
  })

  test('flushes only the contacts cache for scope contacts', async () => {
    const res = await POST(reqWith(ADMIN, { scope: 'contacts' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, scope: 'contacts' })
    expect(invalidateCache).toHaveBeenCalledTimes(1)
    expect(invalidateCache).toHaveBeenCalledWith('contacts')
  })

  test('flushes only the payments cache for scope payments', async () => {
    await POST(reqWith(ADMIN, { scope: 'payments' }))
    expect(invalidateCache).toHaveBeenCalledWith('payments')
    expect(invalidateCache).toHaveBeenCalledTimes(1)
  })

  test('flushes everything without a body, the old behavior', async () => {
    const res = await POST(reqWith(ADMIN))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ scope: 'all' })
    expect(invalidateCache).toHaveBeenCalledWith()
  })

  test('flushes everything for an unknown scope', async () => {
    await POST(reqWith(ADMIN, { scope: 'bogus' }))
    expect(invalidateCache).toHaveBeenCalledWith()
  })
})
