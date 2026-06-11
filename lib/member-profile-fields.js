/** Max lengths for member-editable profile text fields */
export const MEMBER_PROFILE_FIELD_LIMITS = {
  firstName: 50,
  initial: 1,
  lastName: 100,
  town: 80,
  postalAddress: 200,
  zipcode: 10,
  telescopeModel: 120,
  otherEquipment: 500,
  familyGroup: 1000,
}

export const MEMBER_PROFILE_EDITABLE_FIELDS = [
  'firstName',
  'initial',
  'lastName',
  'town',
  'postalAddress',
  'zipcode',
  'telescopeModel',
  'otherEquipment',
  'familyGroup',
]

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/**
 * Sanitize a single member profile text field.
 * @param {string} field
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeMemberProfileField(field, value) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') return ''

  switch (field) {
    case 'initial':
      return sanitizeText(value, 5).charAt(0)
    case 'zipcode':
      return sanitizeText(value, MEMBER_PROFILE_FIELD_LIMITS.zipcode).replace(/[^a-zA-Z0-9-]/g, '')
    default:
      if (field in MEMBER_PROFILE_FIELD_LIMITS) {
        return sanitizeText(value, MEMBER_PROFILE_FIELD_LIMITS[field])
      }
      return ''
  }
}

/**
 * Sanitize all allowed profile fields from a fields object.
 * Non-string photoFileId is passed through when present (set server-side after upload).
 * @param {Record<string, unknown>} fields
 * @returns {Record<string, string>}
 */
export function sanitizeMemberProfileFields(fields) {
  if (!fields || typeof fields !== 'object') return {}

  const result = {}

  for (const key of MEMBER_PROFILE_EDITABLE_FIELDS) {
    if (fields[key] !== undefined) {
      result[key] = sanitizeMemberProfileField(key, fields[key])
    }
  }

  if (typeof fields.photoFileId === 'string' && fields.photoFileId.trim()) {
    result.photoFileId = fields.photoFileId.trim()
  }

  return result
}
