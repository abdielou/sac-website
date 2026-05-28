/** Max length for a single family member display name */
export const FAMILY_MEMBER_NAME_MAX_LENGTH = 100

/**
 * Sanitize a single family member display name for storage and UI.
 * Strips control chars, zero-width chars, semicolons, and collapses whitespace.
 */
export function sanitizeFamilyMemberName(name) {
  if (typeof name !== 'string') return ''
  return name
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FAMILY_MEMBER_NAME_MAX_LENGTH)
}

/**
 * Sanitize an array of family names, drop empties, and reject duplicates.
 * @returns {{ names: string[], error: string|null }}
 */
export function sanitizeFamilyMemberNames(names) {
  if (!Array.isArray(names)) {
    return { names: [], error: null }
  }

  const sanitized = names.map(sanitizeFamilyMemberName).filter(Boolean)
  const seen = new Set()

  for (const name of sanitized) {
    if (seen.has(name)) {
      return { names: [], error: 'No puede haber nombres duplicados' }
    }
    seen.add(name)
  }

  return { names: sanitized, error: null }
}

/** Parse semicolon-separated family names into ordered display names */
export function parseFamilyMembers(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(';')
    .map((segment) => sanitizeFamilyMemberName(segment))
    .filter(Boolean)
}

/** Serialize name array back to semicolon-separated string (no trailing semicolon) */
export function serializeFamilyMembers(names) {
  if (!Array.isArray(names)) return ''
  return sanitizeFamilyMemberNames(names).names.join('; ')
}

/** Parse familyMemberPhotos JSON column; invalid JSON returns {} */
export function parseFamilyMemberPhotos(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
    return {}
  } catch {
    return {}
  }
}

/** Serialize photos object to JSON string; empty object returns '' */
export function serializeFamilyMemberPhotos(photos) {
  if (!photos || typeof photos !== 'object' || Array.isArray(photos)) return ''
  const keys = Object.keys(photos)
  if (keys.length === 0) return ''
  return JSON.stringify(photos)
}

/** Slug for Drive filenames: NFD normalize, lowercase, non-alphanumeric to hyphen, collapse hyphens */
export function nameToPhotoSlug(displayName) {
  if (!displayName || typeof displayName !== 'string') return ''
  return displayName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}
