import {
  sanitizeMemberProfileField,
  sanitizeMemberProfileFields,
  MEMBER_PROFILE_FIELD_LIMITS,
} from '../lib/member-profile-fields'

describe('sanitizeMemberProfileField', () => {
  it('trims and collapses whitespace on firstName', () => {
    expect(sanitizeMemberProfileField('firstName', '  Juan   Carlos  ')).toBe('Juan Carlos')
  })

  it('removes control characters', () => {
    expect(sanitizeMemberProfileField('town', 'San\u0000Juan')).toBe('SanJuan')
  })

  it('limits initial to first character', () => {
    expect(sanitizeMemberProfileField('initial', '  ab  ')).toBe('a')
  })

  it('sanitizes zipcode to alphanumeric and hyphen', () => {
    expect(sanitizeMemberProfileField('zipcode', ' 00901!@# ')).toBe('00901')
  })

  it('enforces max length', () => {
    expect(sanitizeMemberProfileField('firstName', 'a'.repeat(80)).length).toBe(
      MEMBER_PROFILE_FIELD_LIMITS.firstName
    )
  })
})

describe('sanitizeMemberProfileFields', () => {
  it('sanitizes only editable fields', () => {
    expect(
      sanitizeMemberProfileFields({
        firstName: '  Ana ',
        email: 'evil@example.com',
        town: 'Bayamon',
      })
    ).toEqual({
      firstName: 'Ana',
      town: 'Bayamon',
    })
  })

  it('passes through photoFileId when string', () => {
    expect(
      sanitizeMemberProfileFields({
        firstName: 'Ana',
        photoFileId: ' drive-id-123 ',
      })
    ).toEqual({
      firstName: 'Ana',
      photoFileId: 'drive-id-123',
    })
  })
})
