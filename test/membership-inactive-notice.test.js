// Copy selection for the member-portal denial notice

// Mock google-sheets first to prevent ESM/CJS conflicts when member-access imports it
jest.mock('../lib/google-sheets', () => ({
  getMemberByEmail: jest.fn(),
}))

// next-auth is ESM-only; the component imports signOut from auth.js.
// Use the mock shape from test/dev-auth-bypass.test.js, NOT the one in
// test/auth.test.js — auth.js calls NextAuth() as a default export, so the mock
// must expose `default` as a function or the import throws
// "(0 , _nextAuth.default) is not a function". Verified.
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

import { getNoticeCopy } from '@/components/member/MembershipInactiveNotice'
import { ACCESS_REASONS } from '@/lib/member-access'

describe('getNoticeCopy', () => {
  it('tells an expired member their membership lapsed', () => {
    const copy = getNoticeCopy(ACCESS_REASONS.INACTIVE, 'expired')
    expect(copy.heading).toBe('Tu membresia no esta activa')
    expect(copy.body).toBe('Tu membresia esta vencida.')
    expect(copy.showRetry).toBe(false)
  })

  it('tells an applicant their request is pending', () => {
    const copy = getNoticeCopy(ACCESS_REASONS.INACTIVE, 'applied')
    expect(copy.heading).toBe('Tu membresia no esta activa')
    expect(copy.body).toBe('Tu solicitud de membresia esta pendiente de aprobacion.')
    expect(copy.showRetry).toBe(false)
  })

  it('falls back to a heading-only notice for an unknown status', () => {
    const copy = getNoticeCopy(ACCESS_REASONS.INACTIVE, 'some-future-status')
    expect(copy.heading).toBe('Tu membresia no esta activa')
    expect(copy.body).toBeNull()
    expect(copy.showRetry).toBe(false)
  })

  it('distinguishes a missing record from a lapsed membership', () => {
    const copy = getNoticeCopy(ACCESS_REASONS.NOT_FOUND, null)
    expect(copy.heading).toBe('No encontramos tu registro de membresia')
    expect(copy.showRetry).toBe(false)
  })

  it('never blames the member for a lookup failure, and offers a retry', () => {
    const copy = getNoticeCopy(ACCESS_REASONS.LOOKUP_FAILED, null)
    expect(copy.heading).toBe('No pudimos verificar tu membresia')
    expect(copy.body).toBe(
      'Ocurrio un problema al verificar tu membresia. Intenta de nuevo en unos minutos.'
    )
    expect(copy.showRetry).toBe(true)
    // An outage must never read as "your membership expired"
    expect(copy.body).not.toMatch(/vencida/)
  })
})
