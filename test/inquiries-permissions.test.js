// The inquiries feature must behave like every other feature in lib/permissions.js

const ORIGINAL_ENV = process.env.ADMIN_PERMISSIONS

function loadPermissions(envValue) {
  jest.resetModules()
  process.env.ADMIN_PERMISSIONS = envValue
  return require('../lib/permissions')
}

afterEach(() => {
  process.env.ADMIN_PERMISSIONS = ORIGINAL_ENV
})

describe('inquiries feature permissions', () => {
  test('write_* grants write_inquiries and read_inquiries', () => {
    const p = loadPermissions('admin@example.com:write_*')
    expect(p.hasPermission('admin@example.com', 'write_inquiries')).toBe(true)
    expect(p.hasPermission('admin@example.com', 'read_inquiries')).toBe(true)
    expect(p.getAccessibleFeatures('admin@example.com')).toContain('inquiries')
  })

  test('read_inquiries alone exposes only the inquiries feature', () => {
    const p = loadPermissions('viewer@example.com:read_inquiries')
    expect(p.getAccessibleFeatures('viewer@example.com')).toEqual(['inquiries'])
    expect(p.hasPermission('viewer@example.com', 'write_inquiries')).toBe(false)
  })

  test('write_inquiries implies read_inquiries', () => {
    const p = loadPermissions('editor@example.com:write_inquiries')
    expect(p.hasPermission('editor@example.com', 'read_inquiries')).toBe(true)
    expect(p.canPerformAction('editor@example.com', 'write_inquiries')).toBe(true)
  })

  test('a members-only admin has no emails access', () => {
    const p = loadPermissions('m@example.com:write_members')
    expect(p.hasPermission('m@example.com', 'read_inquiries')).toBe(false)
    expect(p.getAccessibleFeatures('m@example.com')).not.toContain('inquiries')
  })

  test('VALID_PERMISSIONS lists both inquiries permissions', () => {
    const p = loadPermissions('')
    expect(p.VALID_PERMISSIONS).toEqual(
      expect.arrayContaining(['read_inquiries', 'write_inquiries'])
    )
  })
})
