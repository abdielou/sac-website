// Membership gate on the member API surface

// auth(handler) wraps the handler and injects req.auth. Identity-mock it so the
// test can supply req.auth directly.
jest.mock('../auth', () => ({ auth: (handler) => handler }))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init) => ({ status: init?.status ?? 200, json: async () => body }),
  },
  after: (fn) => fn(),
}))

jest.mock('../lib/google-sheets', () => ({
  getMemberByEmail: jest.fn(),
  updateMemberProfile: jest.fn(),
}))
jest.mock('../lib/google-drive', () => ({ uploadPhoto: jest.fn() }))
jest.mock('../lib/apps-script', () => ({ notifyPhotoUpload: jest.fn() }))
jest.mock('../lib/id-card/verifyToken', () => ({ generateVerifyToken: () => 'testtoken' }))

import { getMemberByEmail } from '../lib/google-sheets'
import { GET } from '../app/api/member/profile/route'

const req = (user) => ({ auth: { user } })
const MEMBER = { email: 'user@sociedadastronomia.com', isAdmin: false }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/member/profile — membership gate', () => {
  it('returns 403 for an expired member', async () => {
    getMemberByEmail.mockResolvedValue({ status: 'expired', email: MEMBER.email })
    const res = await GET(req(MEMBER))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Membresia inactiva')
    expect(body.details).toBe('Access denied: inactive')
  })

  it('returns 403 for a SAC-domain user with no sheet row', async () => {
    getMemberByEmail.mockResolvedValue(null)
    const res = await GET(req(MEMBER))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.details).toBe('Access denied: not-found')
  })

  it('returns 403 when the sheet lookup fails (fails closed)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    getMemberByEmail.mockRejectedValue(new Error('Sheets API 503'))
    const res = await GET(req(MEMBER))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.details).toBe('Access denied: lookup-failed')
    spy.mockRestore()
  })

  it('returns 401 rather than 403 when unauthenticated', async () => {
    const res = await GET({ auth: null })
    expect(res.status).toBe(401)
  })

  it('lets an active member through the gate', async () => {
    getMemberByEmail.mockResolvedValue({
      status: 'active',
      email: MEMBER.email,
      firstName: 'Test',
      familyMembers: [],
      familyMemberPhotos: {},
      photoFileId: null,
    })
    const res = await GET(req(MEMBER))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('active')
  })
})
