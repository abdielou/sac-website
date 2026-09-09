// The contacts feature must behave like every other feature in lib/permissions.js

const ORIGINAL_ENV = process.env.ADMIN_PERMISSIONS

function loadPermissions(envValue) {
  jest.resetModules()
  process.env.ADMIN_PERMISSIONS = envValue
  return require('../lib/permissions')
}

afterEach(() => {
  process.env.ADMIN_PERMISSIONS = ORIGINAL_ENV
})

describe('contacts feature permissions', () => {
  test('write_* grants write_contacts and read_contacts', () => {
    const p = loadPermissions('admin@example.com:write_*')
    expect(p.hasPermission('admin@example.com', 'write_contacts')).toBe(true)
    expect(p.hasPermission('admin@example.com', 'read_contacts')).toBe(true)
    expect(p.getAccessibleFeatures('admin@example.com')).toContain('contacts')
  })

  test('read_contacts alone exposes only the contacts feature', () => {
    const p = loadPermissions('viewer@example.com:read_contacts')
    expect(p.getAccessibleFeatures('viewer@example.com')).toEqual(['contacts'])
    expect(p.hasPermission('viewer@example.com', 'write_contacts')).toBe(false)
  })

  test('write_contacts implies read_contacts', () => {
    const p = loadPermissions('editor@example.com:write_contacts')
    expect(p.hasPermission('editor@example.com', 'read_contacts')).toBe(true)
    expect(p.canPerformAction('editor@example.com', 'write_contacts')).toBe(true)
  })

  test('a members-only admin has no emails access', () => {
    const p = loadPermissions('m@example.com:write_members')
    expect(p.hasPermission('m@example.com', 'read_contacts')).toBe(false)
    expect(p.getAccessibleFeatures('m@example.com')).not.toContain('contacts')
  })

  test('VALID_PERMISSIONS lists both contacts permissions', () => {
    const p = loadPermissions('')
    expect(p.VALID_PERMISSIONS).toEqual(expect.arrayContaining(['read_contacts', 'write_contacts']))
  })
})
