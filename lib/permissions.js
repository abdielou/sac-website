// Role constants
export const Role = {
  ADMIN: 'admin',
  MANAGEMENT_ADMIN: 'management_admin',
  BLOG_ADMIN: 'blog_admin',
}
/**
 * Create an access error response
 * @param {string} code - Error code (UNAUTHORIZED or FORBIDDEN)
 * @param {string} message - Error message
 * @param {object} details - Additional error details
 * @returns {{code: string, message: string, details: object}}
 */
export function createAccessError(code, message, details = {}) {
  return {
    code,
    message,
    details,
  }
}

/**
 * Create an unauthorized error (user not in allowed list)
 * @param {string} email
 * @returns {{code: string, message: string, details: object}}
 */
export function createUnauthorizedError(email) {
  console.error(`Unauthorized access attempt: ${email}`)
  return createAccessError('UNAUTHORIZED', 'User is not authorized to access the admin dashboard', {
    email,
  })
}

/**
 * Create a forbidden error (user lacks permission for specific feature)
 * @param {string} email
 * @param {string} requestedFeature
 * @param {string[]} availableFeatures
 * @returns {{code: string, message: string, details: object}}
 */
export function createForbiddenError(email, requestedFeature, availableFeatures) {
  console.error(
    `Forbidden access attempt: ${email} tried to access ${requestedFeature}, available: ${availableFeatures.join(', ')}`
  )
  return createAccessError('FORBIDDEN', 'User does not have permission to access this feature', {
    email,
    requestedFeature,
    availableFeatures,
  })
}

const VALID_ROLES = [Role.ADMIN, Role.MANAGEMENT_ADMIN, Role.BLOG_ADMIN]

// Available admin features (tabs)
export const AVAILABLE_FEATURES = ['dashboard', 'members', 'payments', 'articles']

// Available actions
export const Actions = {
  // Dashboard actions
  SCAN_INBOX: 'scan_inbox',

  // Members actions
  EDIT_MEMBER: 'edit_member',
  DELETE_MEMBER: 'delete_member',
  DOWNLOAD_CSV_MEMBERS: 'download_csv_members',

  // Payments actions
  EDIT_PAYMENT: 'edit_payment',
  DOWNLOAD_CSV_PAYMENTS: 'download_csv_payments',

  // Articles actions
  CREATE_ARTICLE: 'create_article',
  EDIT_ARTICLE: 'edit_article',
  PUBLISH_ARTICLE: 'publish_article',
  DELETE_ARTICLE: 'delete_article',
}

// Role-based action permissions
const ROLE_PERMISSIONS = {
  [Role.ADMIN]: [
    Actions.SCAN_INBOX,
    Actions.EDIT_MEMBER,
    Actions.DELETE_MEMBER,
    Actions.DOWNLOAD_CSV_MEMBERS,
    Actions.EDIT_PAYMENT,
    Actions.DOWNLOAD_CSV_PAYMENTS,
    Actions.CREATE_ARTICLE,
    Actions.EDIT_ARTICLE,
    Actions.PUBLISH_ARTICLE,
    Actions.DELETE_ARTICLE,
  ],
  [Role.MANAGEMENT_ADMIN]: [
    Actions.EDIT_MEMBER,
    Actions.DELETE_MEMBER,
    Actions.DOWNLOAD_CSV_MEMBERS,
    Actions.EDIT_PAYMENT,
    Actions.DOWNLOAD_CSV_PAYMENTS,
  ],
  [Role.BLOG_ADMIN]: [
    Actions.CREATE_ARTICLE,
    Actions.EDIT_ARTICLE,
    Actions.PUBLISH_ARTICLE,
    Actions.DELETE_ARTICLE,
  ],
}

/**
 * Validate role value
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return VALID_ROLES.includes(role.toLowerCase())
}

/**
 * Validate feature names
 * @param {string[]} features
 * @returns {string[]}
 */
function validateFeatures(features) {
  return features.filter((feature) => AVAILABLE_FEATURES.includes(feature.toLowerCase()))
}

/**
 * Parse role from entry string
 * @param {string} entry
 * @returns {{role: string|null, isValid: boolean}}
 */
function parseRoleFromEntry(entry) {
  const parts = entry.split(':')
  if (parts.length < 2) {
    return { role: null, isValid: true } // No role = read-only
  }

  const role = parts[1].trim().toLowerCase()
  if (!isValidRole(role)) {
    console.warn(`Invalid role "${role}" in entry "${entry}", defaulting to read-only (no role)`)
    return { role: null, isValid: false }
  }

  return { role, isValid: true }
}

/**
 * Parse features from entry string
 * @param {string} entry
 * @returns {string[]}
 */
function parseFeaturesFromEntry(entry) {
  const parts = entry.split(':')
  if (parts.length < 3) {
    return []
  }

  const featuresStr = parts.slice(2).join(':')
  const features = featuresStr
    .split(',')
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f.length > 0)

  const validFeatures = validateFeatures(features)
  const invalidFeatures = features.filter((f) => !AVAILABLE_FEATURES.includes(f.toLowerCase()))

  if (invalidFeatures.length > 0) {
    console.warn(`Invalid features "${invalidFeatures.join(', ')}" in entry "${entry}"`)
  }

  return validFeatures
}

/**
 * PermissionConfig class for parsing and validating user permissions
 */
export class PermissionConfig {
  constructor(envValue) {
    this.envValue = envValue
    this.users = this.parse()
  }

  /**
   * Parse authorized emails from environment variable
   * Supports formats:
   * - "email" - User with no role (read-only access)
   * - "email:role" - User with specified role
   *
   * Entries are separated by semicolons
   *
   * @returns {Array<{email: string, role: string|null, assignedFeatures: string[]}>}
   */
  parse() {
    if (!this.envValue) return []

    // Always use semicolon as separator
    const separator = ';'

    const entries = this.envValue
      .split(separator)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && entry.includes('@'))

    return entries.map((entry) => {
      const email = entry.split(':')[0].trim().toLowerCase()
      const { role } = parseRoleFromEntry(entry)

      return { email, role, assignedFeatures: [] }
    })
  }

  /**
   * Validate the configuration
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = []

    if (!this.envValue) {
      return { valid: true, errors }
    }

    // Check for duplicate emails
    const emails = this.users.map((u) => u.email)
    const duplicates = emails.filter((email, index) => emails.indexOf(email) !== index)
    if (duplicates.length > 0) {
      errors.push(`Duplicate emails found: ${duplicates.join(', ')}`)
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Get available features
   * @returns {string[]}
   */
  getAvailableFeatures() {
    return [...AVAILABLE_FEATURES]
  }

  /**
   * Find user permission entry by email
   * @param {string} email
   * @returns {{email: string, role: string, assignedFeatures: string[]}|undefined}
   */
  getUserPermission(email) {
    const normalizedEmail = email.toLowerCase()
    return this.users.find((u) => u.email === normalizedEmail)
  }
}

/**
 * PermissionChecker class for access control
 */
export class PermissionChecker {
  constructor(config) {
    this.config = config
  }

  /**
   * Check if user can access the admin dashboard
   * @param {string} email
   * @returns {boolean}
   */
  canAccessDashboard(email) {
    const permission = this.config.getUserPermission(email)
    return permission !== undefined
  }

  /**
   * Check if user can access a specific feature (tab)
   * Everyone with dashboard access can view all tabs (read-only)
   * @param {string} email
   * @param {string} featureName
   * @returns {boolean}
   */
  canAccessFeature(email, featureName) {
    const permission = this.config.getUserPermission(email)
    if (!permission) {
      return false
    }

    // Everyone with dashboard access can view all tabs
    return AVAILABLE_FEATURES.includes(featureName.toLowerCase())
  }

  /**
   * Check if user can perform a specific action
   * @param {string} email
   * @param {string} action - Action from Actions enum
   * @returns {boolean}
   */
  canPerformAction(email, action) {
    const permission = this.config.getUserPermission(email)
    if (!permission) {
      return false
    }

    // Check if user's role has permission for this action
    const rolePermissions = ROLE_PERMISSIONS[permission.role] || []
    return rolePermissions.includes(action)
  }

  /**
   * Get list of features accessible to user
   * Everyone can access all tabs (read-only)
   * @param {string} email
   * @returns {string[]}
   */
  getAccessibleFeatures(email) {
    const permission = this.config.getUserPermission(email)
    if (!permission) {
      return []
    }

    // Everyone can view all tabs
    return [...AVAILABLE_FEATURES]
  }

  /**
   * Get list of actions user can perform
   * @param {string} email
   * @returns {string[]}
   */
  getAccessibleActions(email) {
    const permission = this.config.getUserPermission(email)
    if (!permission) {
      return []
    }

    return ROLE_PERMISSIONS[permission.role] || []
  }

  /**
   * Check if user has admin role
   * @param {string} email
   * @returns {boolean}
   */
  isAdmin(email) {
    const permission = this.config.getUserPermission(email)
    return permission?.role === Role.ADMIN
  }

  /**
   * Get user's role
   * @param {string} email
   * @returns {string|null} role or null if no permission
   */
  getUserRole(email) {
    const permission = this.config.getUserPermission(email)
    return permission?.role || null
  }

  /**
   * Get user's assigned features (deprecated - everyone can access all features)
   * @param {string} email
   * @returns {string[]}
   */
  getUserFeatures(email) {
    return this.getAccessibleFeatures(email)
  }
}

// Create default instances for convenience
// Support both old and new environment variables for backward compatibility
const legacyEmails = process.env.AUTHORIZED_ADMIN_EMAILS || ''
const roleBasedConfig = process.env.ADMIN_ROLE_PERMISSIONS || ''

// Parse legacy emails as users with no role (read-only access)
const legacyConfig = legacyEmails
  ? legacyEmails.split(',').map((email) => ({
      email: email.trim().toLowerCase(),
      role: null, // No role = read-only access
      assignedFeatures: [],
    }))
  : []

// Parse new role-based configuration
const roleConfig = new PermissionConfig(roleBasedConfig)

// Merge configurations: role-based takes precedence over legacy
const mergedUsers = [...roleConfig.users]
legacyConfig.forEach((legacyUser) => {
  if (!mergedUsers.find((u) => u.email === legacyUser.email)) {
    mergedUsers.push(legacyUser)
  }
})

// Create a merged config
class MergedConfig extends PermissionConfig {
  constructor() {
    super('')
    this.users = mergedUsers
  }
}

const defaultConfig = new MergedConfig()
const defaultChecker = new PermissionChecker(defaultConfig)

// Export convenience functions
export const canAccessDashboard = (email) => defaultChecker.canAccessDashboard(email)
export const canAccessFeature = (email, featureName) =>
  defaultChecker.canAccessFeature(email, featureName)
export const canPerformAction = (email, action) => defaultChecker.canPerformAction(email, action)
export const getAccessibleFeatures = (email) => defaultChecker.getAccessibleFeatures(email)
export const getAccessibleActions = (email) => defaultChecker.getAccessibleActions(email)
export const isAdmin = (email) => defaultChecker.isAdmin(email)
export const getUserRole = (email) => defaultChecker.getUserRole(email)
export const getUserFeatures = (email) => defaultChecker.getUserFeatures(email)
