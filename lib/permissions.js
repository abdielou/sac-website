/**
 * Feature-based permissions system.
 *
 * Permissions are assigned per user as a flat list:
 *   ADMIN_PERMISSIONS=user@example.com:write_*;other@example.com:write_articles,read_guides
 *
 * Permission format:
 *   - write_* = all write permissions (admin shorthand)
 *   - write_X = full access to feature X (implies read_X)
 *   - read_X  = read-only access to feature X
 *
 * Features: members, payments, articles, guides
 * Special: scan_inbox (dashboard action, not tied to a feature)
 */

// All features in the system
export const FEATURES = ['members', 'payments', 'articles', 'guides']

// All valid permissions
export const VALID_PERMISSIONS = [
  'write_*',
  'read_*',
  'scan_inbox',
  ...FEATURES.flatMap((f) => [`read_${f}`, `write_${f}`]),
]

/**
 * Parse the ADMIN_PERMISSIONS env var into a user map.
 *
 * Format: "email:perm1,perm2;email2:perm3,perm4"
 *
 * @param {string} envValue
 * @returns {Map<string, string[]>} email -> list of raw permissions
 */
function parsePermissions(envValue) {
  const users = new Map()
  if (!envValue) return users

  const separator = envValue.includes(';') ? ';' : ','

  // If no colons, treat as legacy comma-separated emails (read-only, all features)
  if (!envValue.includes(':')) {
    envValue
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'))
      .forEach((email) => {
        users.set(email, FEATURES.map((f) => `read_${f}`))
      })
    return users
  }

  const entries = envValue.split(separator).map((e) => e.trim()).filter((e) => e.length > 0)

  for (const entry of entries) {
    const colonIdx = entry.indexOf(':')
    if (colonIdx === -1) continue

    const email = entry.substring(0, colonIdx).trim().toLowerCase()
    if (!email.includes('@')) continue

    const permsStr = entry.substring(colonIdx + 1)
    const perms = permsStr
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 0)

    // Validate permissions
    const valid = perms.filter((p) => VALID_PERMISSIONS.includes(p))
    const invalid = perms.filter((p) => !VALID_PERMISSIONS.includes(p))
    if (invalid.length > 0) {
      console.warn(`Invalid permissions for ${email}: ${invalid.join(', ')}`)
    }

    users.set(email, valid)
  }

  return users
}

/**
 * Expand raw permissions into effective permissions.
 * - write_* expands to all write + read + scan_inbox
 * - write_X implies read_X
 *
 * @param {string[]} rawPerms
 * @returns {Set<string>} effective permissions
 */
function expandPermissions(rawPerms) {
  const effective = new Set()

  for (const perm of rawPerms) {
    if (perm === 'write_*') {
      // Admin shorthand — all permissions
      effective.add('scan_inbox')
      for (const f of FEATURES) {
        effective.add(`read_${f}`)
        effective.add(`write_${f}`)
      }
    } else if (perm === 'read_*') {
      // Read-only all features
      for (const f of FEATURES) {
        effective.add(`read_${f}`)
      }
    } else if (perm.startsWith('write_')) {
      effective.add(perm)
      // write implies read
      const feature = perm.substring(6)
      effective.add(`read_${feature}`)
    } else {
      effective.add(perm)
    }
  }

  return effective
}

// --- Singleton instances ---

let _userPerms = null // Map<email, Set<string>> of expanded permissions

function getUserPermsMap() {
  if (!_userPerms) {
    // Support both new and legacy env vars
    const newPerms = process.env.ADMIN_PERMISSIONS || ''
    const legacyRoles = process.env.ADMIN_ROLE_PERMISSIONS || ''
    const legacyEmails = process.env.AUTHORIZED_ADMIN_EMAILS || ''

    _userPerms = new Map()

    // Parse new format first (takes precedence)
    if (newPerms) {
      const parsed = parsePermissions(newPerms)
      for (const [email, rawPerms] of parsed) {
        _userPerms.set(email, expandPermissions(rawPerms))
      }
    }

    // Fall back to legacy ADMIN_ROLE_PERMISSIONS (map roles to new permissions)
    if (!newPerms && legacyRoles) {
      const ROLE_TO_PERMS = {
        admin: ['write_*'],
        management_admin: ['write_members', 'write_payments', 'read_articles', 'read_guides'],
        blog_admin: ['read_members', 'read_payments', 'write_articles', 'read_guides'],
        guides_admin: ['write_guides'],
      }

      const separator = legacyRoles.includes(';') ? ';' : ','
      const entries = legacyRoles.split(separator).map((e) => e.trim()).filter((e) => e.length > 0)

      for (const entry of entries) {
        const parts = entry.split(':')
        const email = parts[0]?.trim().toLowerCase()
        const role = parts[1]?.trim().toLowerCase()
        if (!email?.includes('@') || !role) continue
        const perms = ROLE_TO_PERMS[role] || FEATURES.map((f) => `read_${f}`)
        if (!_userPerms.has(email)) {
          _userPerms.set(email, expandPermissions(perms))
        }
      }
    }

    // Fall back to legacy AUTHORIZED_ADMIN_EMAILS (read-only all features)
    if (legacyEmails) {
      const emails = legacyEmails.split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))
      for (const email of emails) {
        if (!_userPerms.has(email)) {
          _userPerms.set(email, expandPermissions(FEATURES.map((f) => `read_${f}`)))
        }
      }
    }
  }
  return _userPerms
}

function getUserPermissions(email) {
  if (!email) return new Set()
  return getUserPermsMap().get(email.toLowerCase()) || new Set()
}

// --- Public API ---

/**
 * Check if user can access the admin dashboard (has any permission at all)
 */
export function canAccessDashboard(email) {
  return getUserPermissions(email).size > 0
}

/**
 * Check if user has a specific permission.
 * @param {string} email
 * @param {string} permission - e.g., 'read_members', 'write_articles', 'scan_inbox'
 */
export function hasPermission(email, permission) {
  return getUserPermissions(email).has(permission)
}

/**
 * Get list of features visible to user (those with read_X or write_X).
 * Always includes 'dashboard' if user has any permission.
 */
export function getAccessibleFeatures(email) {
  const perms = getUserPermissions(email)
  if (perms.size === 0) return []

  const features = ['dashboard']
  for (const f of FEATURES) {
    if (perms.has(`read_${f}`) || perms.has(`write_${f}`)) {
      features.push(f)
    }
  }
  return features
}

/**
 * Get all permissions for a user (for session).
 */
export function getAllPermissions(email) {
  return [...getUserPermissions(email)]
}

/**
 * Check if user can perform a write action on a feature.
 * @param {string} email
 * @param {string} action - legacy action name (e.g., 'edit_member') or new permission (e.g., 'write_members')
 */
export function canPerformAction(email, action) {
  const perms = getUserPermissions(email)

  // Direct match
  if (perms.has(action)) return true

  // Legacy action name mapping
  const LEGACY_MAP = {
    scan_inbox: 'scan_inbox',
    edit_member: 'write_members',
    delete_member: 'write_members',
    download_csv_members: 'write_members',
    edit_payment: 'write_payments',
    download_csv_payments: 'write_payments',
    create_article: 'write_articles',
    edit_article: 'write_articles',
    publish_article: 'write_articles',
    delete_article: 'write_articles',
    create_guide: 'write_guides',
    edit_guide: 'write_guides',
    publish_guide: 'write_guides',
    delete_guide: 'write_guides',
  }

  const mapped = LEGACY_MAP[action]
  if (mapped) return perms.has(mapped)

  return false
}

// --- Legacy compatibility exports ---
// These maintain backward compatibility with existing code

export const Actions = {
  SCAN_INBOX: 'scan_inbox',
  EDIT_MEMBER: 'edit_member',
  DELETE_MEMBER: 'delete_member',
  DOWNLOAD_CSV_MEMBERS: 'download_csv_members',
  EDIT_PAYMENT: 'edit_payment',
  DOWNLOAD_CSV_PAYMENTS: 'download_csv_payments',
  CREATE_ARTICLE: 'create_article',
  EDIT_ARTICLE: 'edit_article',
  PUBLISH_ARTICLE: 'publish_article',
  DELETE_ARTICLE: 'delete_article',
  CREATE_GUIDE: 'create_guide',
  EDIT_GUIDE: 'edit_guide',
  PUBLISH_GUIDE: 'publish_guide',
  DELETE_GUIDE: 'delete_guide',
}

export const Role = {
  ADMIN: 'admin',
  MANAGEMENT_ADMIN: 'management_admin',
  BLOG_ADMIN: 'blog_admin',
  GUIDES_ADMIN: 'guides_admin',
}

export const AVAILABLE_FEATURES = ['dashboard', 'members', 'payments', 'articles', 'guides']

export function isAdmin(email) {
  return hasPermission(email, 'write_members') &&
    hasPermission(email, 'write_payments') &&
    hasPermission(email, 'write_articles') &&
    hasPermission(email, 'write_guides')
}

export function getUserRole(email) {
  const perms = getUserPermissions(email)
  if (perms.size === 0) return null
  if (perms.has('write_*') || (perms.has('write_members') && perms.has('write_payments') && perms.has('write_articles') && perms.has('write_guides'))) return 'admin'
  if (perms.has('write_members') && perms.has('write_payments')) return 'management_admin'
  if (perms.has('write_articles')) return 'blog_admin'
  if (perms.has('write_guides')) return 'guides_admin'
  return 'read_only'
}

export function getAccessibleActions(email) {
  return getAllPermissions(email)
}

export function getUserFeatures(email) {
  return getAccessibleFeatures(email)
}

// Legacy class exports for auth.js compatibility
export class PermissionConfig {
  constructor(envValue) {
    this.envValue = envValue
    this.users = []
  }
  getUserPermission(email) {
    const perms = getUserPermissions(email)
    if (perms.size === 0) return undefined
    return { email: email.toLowerCase(), role: getUserRole(email) }
  }
}

export class PermissionChecker {
  constructor() {}
  canAccessDashboard(email) { return canAccessDashboard(email) }
  canAccessFeature(email) { return canAccessDashboard(email) }
  canPerformAction(email, action) { return canPerformAction(email, action) }
  getAccessibleFeatures(email) { return getAccessibleFeatures(email) }
  getAccessibleActions(email) { return getAllPermissions(email) }
  isAdmin(email) { return isAdmin(email) }
  getUserRole(email) { return getUserRole(email) }
  getUserFeatures(email) { return getAccessibleFeatures(email) }
}

export function createAccessError(code, message, details = {}) {
  return { code, message, details }
}

export function createUnauthorizedError(email) {
  console.error(`Unauthorized access attempt: ${email}`)
  return createAccessError('UNAUTHORIZED', 'User is not authorized to access the admin dashboard', { email })
}

export function createForbiddenError(email, requestedFeature, availableFeatures) {
  console.error(`Forbidden access attempt: ${email} tried to access ${requestedFeature}`)
  return createAccessError('FORBIDDEN', 'User does not have permission to access this feature', { email, requestedFeature, availableFeatures })
}
