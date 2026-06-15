/**
 * Tests for the dev-only auth bypass and the `ai` feature permission wiring.
 *
 * These target the CURRENT functional permissions API and the `devBypassEnabled`
 * guard in auth.js. next-auth and its providers are ESM-only under node_modules,
 * so they are mocked to let auth.js be required under Jest's CommonJS transform.
 */

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    signIn: jest.fn(),
    signOut: jest.fn(),
    auth: jest.fn(),
  })),
}))
jest.mock('next-auth/providers/google', () => ({ __esModule: true, default: () => ({}) }))
jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: () => ({}) }))

describe('ai feature permissions', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('FEATURES includes ai', () => {
    const { FEATURES } = require('../lib/permissions')
    expect(FEATURES).toContain('ai')
  })

  test('read_ai and write_ai are valid permissions', () => {
    const { VALID_PERMISSIONS } = require('../lib/permissions')
    expect(VALID_PERMISSIONS).toContain('read_ai')
    expect(VALID_PERMISSIONS).toContain('write_ai')
  })

  test('write_ai grants read_ai (write implies read)', () => {
    process.env.ADMIN_PERMISSIONS = 'dev@local.test:write_ai'
    const { getAllPermissions } = require('../lib/permissions')
    const perms = getAllPermissions('dev@local.test')
    expect(perms).toContain('write_ai')
    expect(perms).toContain('read_ai')
  })

  test('ai appears in accessibleFeatures for a write_ai user', () => {
    process.env.ADMIN_PERMISSIONS = 'dev@local.test:write_ai'
    const { getAccessibleFeatures } = require('../lib/permissions')
    expect(getAccessibleFeatures('dev@local.test')).toContain('ai')
  })

  test('read_ai alone grants the ai feature but not write_ai', () => {
    process.env.ADMIN_PERMISSIONS = 'dev@local.test:read_ai'
    const { getAccessibleFeatures, getAllPermissions } = require('../lib/permissions')
    expect(getAccessibleFeatures('dev@local.test')).toContain('ai')
    expect(getAllPermissions('dev@local.test')).toContain('read_ai')
    expect(getAllPermissions('dev@local.test')).not.toContain('write_ai')
  })

  test('write_* grants both read_ai and write_ai', () => {
    process.env.ADMIN_PERMISSIONS = 'dev@local.test:write_*'
    const { getAllPermissions } = require('../lib/permissions')
    const perms = getAllPermissions('dev@local.test')
    expect(perms).toContain('read_ai')
    expect(perms).toContain('write_ai')
  })
})

describe('devBypassEnabled guard', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  function loadGuard() {
    return require('../auth').devBypassEnabled
  }

  test('enabled in development when AUTH_DEV_BYPASS=true', () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_DEV_BYPASS = 'true'
    expect(loadGuard()).toBe(true)
  })

  test('DISABLED in production even when AUTH_DEV_BYPASS=true (fails closed)', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_DEV_BYPASS = 'true'
    expect(loadGuard()).toBe(false)
  })

  test('disabled when AUTH_DEV_BYPASS is unset', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.AUTH_DEV_BYPASS
    expect(loadGuard()).toBe(false)
  })

  test('disabled when AUTH_DEV_BYPASS is not exactly "true"', () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_DEV_BYPASS = '1'
    expect(loadGuard()).toBe(false)
  })
})
