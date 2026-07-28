// Member portal access gate tests

jest.mock('../lib/google-sheets', () => ({
  getMemberByEmail: jest.fn(),
}))

import { getMemberByEmail } from '../lib/google-sheets'
import { ACCESS_REASONS, ACTIVE_MEMBER_STATUSES, resolveMemberAccess } from '../lib/member-access'

const memberSession = (overrides = {}) => ({
  user: { email: 'user@sociedadastronomia.com', isAdmin: false, ...overrides },
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('constants', () => {
  it('entitles exactly active and expiring-soon', () => {
    expect(ACTIVE_MEMBER_STATUSES).toEqual(['active', 'expiring-soon'])
  })
})

describe('resolveMemberAccess — entitled statuses', () => {
  it('allows an active member', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'active' })
    const result = await resolveMemberAccess(memberSession())
    expect(result).toEqual({ allowed: true, reason: ACCESS_REASONS.OK, status: 'active' })
  })

  it('allows an expiring-soon member (Jan-Feb grace period)', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'expiring-soon' })
    const result = await resolveMemberAccess(memberSession())
    expect(result).toEqual({ allowed: true, reason: ACCESS_REASONS.OK, status: 'expiring-soon' })
  })
})

describe('resolveMemberAccess — denied statuses', () => {
  it('denies an expired member and reports the status', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'expired' })
    const result = await resolveMemberAccess(memberSession())
    expect(result).toEqual({ allowed: false, reason: ACCESS_REASONS.INACTIVE, status: 'expired' })
  })

  it('denies an applied member and reports the status', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'applied' })
    const result = await resolveMemberAccess(memberSession())
    expect(result).toEqual({ allowed: false, reason: ACCESS_REASONS.INACTIVE, status: 'applied' })
  })
})

describe('resolveMemberAccess — fails closed', () => {
  it('denies a SAC-domain user with no row in the sheet', async () => {
    getMemberByEmail.mockResolvedValue(null)
    const result = await resolveMemberAccess(memberSession())
    expect(result).toEqual({ allowed: false, reason: ACCESS_REASONS.NOT_FOUND, status: null })
  })

  it('denies when the sheet lookup throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    getMemberByEmail.mockRejectedValue(new Error('Sheets API 503'))
    const result = await resolveMemberAccess(memberSession())
    expect(result).toEqual({ allowed: false, reason: ACCESS_REASONS.LOOKUP_FAILED, status: null })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('denies a null session', async () => {
    const result = await resolveMemberAccess(null)
    expect(result).toEqual({ allowed: false, reason: ACCESS_REASONS.NOT_FOUND, status: null })
    expect(getMemberByEmail).not.toHaveBeenCalled()
  })

  it('denies a session with no email', async () => {
    const result = await resolveMemberAccess({ user: { isAdmin: false } })
    expect(result).toEqual({ allowed: false, reason: ACCESS_REASONS.NOT_FOUND, status: null })
    expect(getMemberByEmail).not.toHaveBeenCalled()
  })
})

describe('resolveMemberAccess — admin exemption', () => {
  it('allows an admin whose own membership is expired', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'expired' })
    const result = await resolveMemberAccess(memberSession({ isAdmin: true }))
    expect(result).toEqual({ allowed: true, reason: ACCESS_REASONS.ADMIN, status: null })
  })

  it('allows an admin during a sheet outage (lookup never runs)', async () => {
    getMemberByEmail.mockRejectedValue(new Error('Sheets API 503'))
    const result = await resolveMemberAccess(memberSession({ isAdmin: true }))
    expect(result).toEqual({ allowed: true, reason: ACCESS_REASONS.ADMIN, status: null })
    expect(getMemberByEmail).not.toHaveBeenCalled()
  })
})

describe('resolveMemberAccess — email resolution', () => {
  it('prefers sacEmail over the session email', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'active' })
    await resolveMemberAccess(
      memberSession({ email: 'personal@gmail.com', sacEmail: 'Real.User@sociedadastronomia.com' })
    )
    expect(getMemberByEmail).toHaveBeenCalledWith('real.user@sociedadastronomia.com')
  })

  it('falls back to the session email when sacEmail is absent', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'active' })
    await resolveMemberAccess(memberSession({ email: 'User@sociedadastronomia.com' }))
    expect(getMemberByEmail).toHaveBeenCalledWith('user@sociedadastronomia.com')
  })
})
