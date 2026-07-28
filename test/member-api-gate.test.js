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

describe('member route gate coverage — structural', () => {
  const fs = require('fs')
  const path = require('path')

  const REPO_ROOT = path.join(__dirname, '..')
  const MEMBER_API_DIR = path.join(REPO_ROOT, 'app', 'api', 'member')

  // Every route file under app/api/member/ that is expected to gate access
  // behind checkMemberAccess(). Keep this list in sync with the filesystem —
  // the last test in this block fails if they diverge.
  const GATED_ROUTES = [
    'app/api/member/profile/route.js',
    'app/api/member/id-card/route.js',
    'app/api/member/photo/[email]/route.js',
    'app/api/member/photo/[email]/family/[familyName]/route.js',
    'app/api/member/family/[familyName]/photo/route.js',
    'app/api/member/family/[familyName]/id-card/route.js',
    'app/api/member/family/[familyName]/id-card-preview/route.js',
  ]

  GATED_ROUTES.forEach((relPath) => {
    // The test title embeds relPath so a regression names the offending file
    // in Jest's failure output.
    it(`${relPath} calls checkMemberAccess`, () => {
      const filePath = path.join(REPO_ROOT, relPath)
      const content = fs.readFileSync(filePath, 'utf8')
      if (!content.includes('checkMemberAccess')) {
        throw new Error(`Expected ${relPath} to call checkMemberAccess (member portal gate)`)
      }
    })
  })

  it('app/api/member/profile/route.js gates both GET and PUT with checkMemberAccess', () => {
    const relPath = 'app/api/member/profile/route.js'
    const filePath = path.join(REPO_ROOT, relPath)
    const content = fs.readFileSync(filePath, 'utf8')
    const callCount = (content.match(/checkMemberAccess\(/g) || []).length
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  it('GATED_ROUTES covers every route.js actually present under app/api/member/', () => {
    const found = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile() && entry.name === 'route.js') {
          found.push(path.relative(REPO_ROOT, fullPath).split(path.sep).join('/'))
        }
      }
    }
    walk(MEMBER_API_DIR)

    expect(found.sort()).toEqual(
      [...GATED_ROUTES].sort()
    )
  })
})
