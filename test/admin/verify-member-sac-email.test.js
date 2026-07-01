import { verifyMemberSacEmail } from '@/lib/hooks/useAdminData'

describe('verifyMemberSacEmail', () => {
  const EMAIL = 'gaviotadelmar49@gmail.com'
  const SAC_EMAIL = 'luz.perez.lopez@sociedadastronomia.com'

  afterEach(() => {
    jest.restoreAllMocks()
    delete global.fetch
  })

  function mockMembersResponse(body) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    })
  }

  // Reproduces the reported bug: the /api/admin/members route returns the
  // members array under `data`, but the helper used to read `.members`, so
  // verification always failed even though the account was created.
  it('resolves success when the member row has the expected sac_email', async () => {
    mockMembersResponse({ data: [{ email: EMAIL, sacEmail: SAC_EMAIL }] })

    await expect(verifyMemberSacEmail(EMAIL, SAC_EMAIL)).resolves.toEqual({
      success: true,
      sacEmail: SAC_EMAIL,
    })
  })

  it('throws when the member has a different sac_email', async () => {
    mockMembersResponse({ data: [{ email: EMAIL, sacEmail: 'other@sociedadastronomia.com' }] })

    await expect(verifyMemberSacEmail(EMAIL, SAC_EMAIL)).rejects.toThrow(
      'La cuenta no se creó correctamente'
    )
  })

  it('throws when the member is not found', async () => {
    mockMembersResponse({ data: [] })

    await expect(verifyMemberSacEmail(EMAIL, SAC_EMAIL)).rejects.toThrow(
      'La cuenta no se creó correctamente'
    )
  })
})
