/**
 * Unit tests for auth.js parsing functions
 * Tests: parseAuthorizedEmails, parseRoleFromEntry, parseFeaturesFromEntry
 */

// Mock next-auth to avoid ESM import issues
jest.mock('next-auth', () => ({
  handlers: { GET: jest.fn(), POST: jest.fn() },
  signIn: jest.fn(),
  signOut: jest.fn(),
  auth: jest.fn(),
}))

jest.mock('next-auth/providers/google', () => () => ({}))

// Import the mocked module
const { parseAuthorizedEmails, parseRoleFromEntry, parseFeaturesFromEntry, getUserRole, getUserFeatures, isAdmin, isAuthorizedEmail } = require('../auth')

describe('parseAuthorizedEmails', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...process.env }
  })

  afterAll(() => {
    process.env = { ...process.env }
  })

  test('returns empty array for undefined env value', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails(undefined)
    expect(result).toEqual([])
  })

  test('returns empty array for empty string', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('')
    expect(result).toEqual([])
  })

  test('parses email-only format (backward compatibility)', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com,admin@test.com')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ email: 'user@example.com', role: 'restricted', assignedFeatures: [] })
    expect(result[1]).toEqual({ email: 'admin@test.com', role: 'restricted', assignedFeatures: [] })
  })

  test('parses email:role format', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com:admin;manager@test.com:restricted')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ email: 'user@example.com', role: 'admin', assignedFeatures: [] })
    expect(result[1]).toEqual({ email: 'manager@test.com', role: 'restricted', assignedFeatures: [] })
  })

  test('parses email:role:features format', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com:admin:dashboard,members;manager@test.com:restricted:payments,articles')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ email: 'user@example.com', role: 'admin', assignedFeatures: ['dashboard', 'members'] })
    expect(result[1]).toEqual({ email: 'manager@test.com', role: 'restricted', assignedFeatures: ['payments', 'articles'] })
  })

  test('normalizes emails to lowercase', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('User@Example.COM')
    expect(result).toHaveLength(1)
    expect(result[0].email).toBe('user@example.com')
  })

  test('trims whitespace from entries', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('  user@example.com  :  admin  :  dashboard  ')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ email: 'user@example.com', role: 'admin', assignedFeatures: ['dashboard'] })
  })

  test('filters out empty entries', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com,,,admin@test.com')
    expect(result).toHaveLength(2)
  })

  test('uses semicolon as separator when present', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com:admin;admin@test.com:restricted')
    expect(result).toHaveLength(2)
    expect(result[0].email).toBe('user@example.com')
    expect(result[1].email).toBe('admin@test.com')
  })

  test('defaults to comma separator when no semicolons', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com,admin@test.com')
    expect(result).toHaveLength(2)
  })

  test('handles mixed case role names', () => {
    const { parseAuthorizedEmails } = require('../auth')
    const result = parseAuthorizedEmails('user@example.com:ADMIN;admin@test.com:Restricted')
    expect(result[0].role).toBe('admin')
    expect(result[1].role).toBe('restricted')
  })
})

describe('parseRoleFromEntry', () => {
  test('returns restricted role when no role specified', () => {
    const result = parseRoleFromEntry('user@example.com')
    expect(result.role).toBe('restricted')
    expect(result.isValid).toBe(true)
  })

  test('parses admin role correctly', () => {
    const result = parseRoleFromEntry('user@example.com:admin')
    expect(result.role).toBe('admin')
    expect(result.isValid).toBe(true)
  })

  test('parses restricted role correctly', () => {
    const result = parseRoleFromEntry('user@example.com:restricted')
    expect(result.role).toBe('restricted')
    expect(result.isValid).toBe(true)
  })

  test('defaults to restricted for invalid role', () => {
    const result = parseRoleFromEntry('user@example.com:superuser')
    expect(result.role).toBe('restricted')
    expect(result.isValid).toBe(false)
  })

  test('handles role with features', () => {
    const result = parseRoleFromEntry('user@example.com:admin:dashboard,members')
    expect(result.role).toBe('admin')
    expect(result.isValid).toBe(true)
  })
})

describe('parseFeaturesFromEntry', () => {
  test('returns empty array when no features specified', () => {
    const result = parseFeaturesFromEntry('user@example.com')
    expect(result).toEqual([])
  })

  test('returns empty array when only role specified', () => {
    const result = parseFeaturesFromEntry('user@example.com:admin')
    expect(result).toEqual([])
  })

  test('parses single feature', () => {
    const result = parseFeaturesFromEntry('user@example.com:restricted:dashboard')
    expect(result).toEqual(['dashboard'])
  })

  test('parses multiple features', () => {
    const result = parseFeaturesFromEntry('user@example.com:restricted:dashboard,members,payments')
    expect(result).toEqual(['dashboard', 'members', 'payments'])
  })

  test('filters out invalid features', () => {
    const result = parseFeaturesFromEntry('user@example.com:restricted:dashboard,invalidfeature,payments')
    expect(result).toEqual(['dashboard', 'payments'])
  })

  test('normalizes feature names to lowercase', () => {
    const result = parseFeaturesFromEntry('user@example.com:restricted:Dashboard,Members')
    expect(result).toEqual(['dashboard', 'members'])
  })

  test('handles duplicate features', () => {
    const result = parseFeaturesFromEntry('user@example.com:restricted:dashboard,dashboard,members')
    expect(result).toEqual(['dashboard', 'members'])
  })
})

describe('getUserRole', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...process.env }
  })

  test('returns restricted for unknown user', () => {
    const { getUserRole } = require('../auth')
    const result = getUserRole('unknown@example.com')
    expect(result).toBe('restricted')
  })

  test('returns role for known user', () => {
    process.env.AUTHORIZED_ADMIN_EMAILS = 'user@example.com:admin'
    const { getUserRole } = require('../auth')
    const result = getUserRole('user@example.com')
    expect(result).toBe('admin')
  })
})

describe('getUserFeatures', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...process.env }
  })

  test('returns empty array for unknown user', () => {
    const { getUserFeatures } = require('../auth')
    const result = getUserFeatures('unknown@example.com')
    expect(result).toEqual([])
  })

  test('returns features for known user', () => {
    process.env.AUTHORIZED_ADMIN_EMAILS = 'user@example.com:restricted:dashboard,members'
    const { getUserFeatures } = require('../auth')
    const result = getUserFeatures('user@example.com')
    expect(result).toEqual(['dashboard', 'members'])
  })
})

describe('isAdmin', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...process.env }
  })

  test('returns false for unknown user', () => {
    const { isAdmin } = require('../auth')
    const result = isAdmin('unknown@example.com')
    expect(result).toBe(false)
  })

  test('returns true for admin user', () => {
    process.env.AUTHORIZED_ADMIN_EMAILS = 'user@example.com:admin'
    const { isAdmin } = require('../auth')
    const result = isAdmin('user@example.com')
    expect(result).toBe(true)
  })

  test('returns false for restricted user', () => {
    process.env.AUTHORIZED_ADMIN_EMAILS = 'user@example.com:restricted'
    const { isAdmin } = require('../auth')
    const result = isAdmin('user@example.com')
    expect(result).toBe(false)
  })
})

describe('isAuthorizedEmail', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...process.env }
  })

  test('returns true for authorized email', () => {
    process.env.AUTHORIZED_ADMIN_EMAILS = 'user@example.com,admin@test.com'
    const { isAuthorizedEmail } = require('../auth')
    expect(isAuthorizedEmail('user@example.com')).toBe(true)
    expect(isAuthorizedEmail('ADMIN@TEST.COM')).toBe(true)
  })

  test('returns false for unauthorized email', () => {
    process.env.AUTHORIZED_ADMIN_EMAILS = 'user@example.com'
    const { isAuthorizedEmail } = require('../auth')
    expect(isAuthorizedEmail('unknown@example.com')).toBe(false)
  })

  test('returns false for empty authorized list', () => {
    const { isAuthorizedEmail } = require('../auth')
    expect(isAuthorizedEmail('user@example.com')).toBe(false)
  })
})