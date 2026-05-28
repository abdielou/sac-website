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

/**
 * Preserve family member photos when names are edited.
 * Matches unchanged names, index-aligned renames, and single remove/add pairs.
 */
export function migrateFamilyMemberPhotos(oldNames, newNames, currentPhotos) {
  if (!Array.isArray(oldNames) || !Array.isArray(newNames)) return {}
  if (!currentPhotos || typeof currentPhotos !== 'object' || Array.isArray(currentPhotos)) {
    return {}
  }

  const photos = { ...currentPhotos }
  const result = {}

  for (const name of newNames) {
    if (photos[name]) {
      result[name] = photos[name]
    }
  }

  const oldSet = new Set(oldNames)
  const newSet = new Set(newNames)

  for (let i = 0; i < Math.min(oldNames.length, newNames.length); i++) {
    const oldName = oldNames[i]
    const newName = newNames[i]
    if (
      oldName !== newName &&
      photos[oldName] &&
      !result[newName] &&
      !newNames.includes(oldName)
    ) {
      result[newName] = photos[oldName]
    }
  }

  const removed = oldNames.filter((name) => !newSet.has(name))
  const added = newNames.filter((name) => !oldSet.has(name))

  if (removed.length === 1 && added.length === 1 && !result[added[0]]) {
    const [oldName] = removed
    const [newName] = added
    if (photos[oldName]) {
      result[newName] = photos[oldName]
    }
  }

  const pruned = {}
  for (const name of newNames) {
    if (result[name]) {
      pruned[name] = result[name]
    }
  }
  return pruned
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
