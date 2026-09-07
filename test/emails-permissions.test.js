// The emails feature must behave like every other feature in lib/permissions.js

const ORIGINAL_ENV = process.env.ADMIN_PERMISSIONS

function loadPermissions(envValue) {
  jest.resetModules()
  process.env.ADMIN_PERMISSIONS = envValue
  return require('../lib/permissions')
}

afterEach(() => {
  process.env.ADMIN_PERMISSIONS = ORIGINAL_ENV
})

describe('emails feature permissions', () => {
  test('write_* grants write_emails and read_emails', () => {
    const p = loadPermissions('admin@example.com:write_*')
    expect(p.hasPermission('admin@example.com', 'write_emails')).toBe(true)
    expect(p.hasPermission('admin@example.com', 'read_emails')).toBe(true)
    expect(p.getAccessibleFeatures('admin@example.com')).toContain('emails')
  })

  test('read_emails alone exposes only the emails feature', () => {
    const p = loadPermissions('viewer@example.com:read_emails')
    expect(p.getAccessibleFeatures('viewer@example.com')).toEqual(['emails'])
    expect(p.hasPermission('viewer@example.com', 'write_emails')).toBe(false)
  })

  test('write_emails implies read_emails', () => {
    const p = loadPermissions('editor@example.com:write_emails')
    expect(p.hasPermission('editor@example.com', 'read_emails')).toBe(true)
    expect(p.canPerformAction('editor@example.com', 'write_emails')).toBe(true)
  })

  test('a members-only admin has no emails access', () => {
    const p = loadPermissions('m@example.com:write_members')
    expect(p.hasPermission('m@example.com', 'read_emails')).toBe(false)
    expect(p.getAccessibleFeatures('m@example.com')).not.toContain('emails')
  })

  test('VALID_PERMISSIONS lists both emails permissions', () => {
    const p = loadPermissions('')
    expect(p.VALID_PERMISSIONS).toEqual(expect.arrayContaining(['read_emails', 'write_emails']))
  })
})
