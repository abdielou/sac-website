import {
  PermissionConfig,
  PermissionChecker,
  Role,
  Actions,
  AVAILABLE_FEATURES,
  createUnauthorizedError,
  createForbiddenError,
} from './permissions'

describe('PermissionConfig', () => {
  describe('Email-only format parsing', () => {
    test('should parse email-only format', () => {
      const config = new PermissionConfig('user@example.com')
      const users = config.users

      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('user@example.com')
    })

    test('should default to null role for email-only format (read-only access)', () => {
      const config = new PermissionConfig('user@example.com')
      const users = config.users

      expect(users[0].role).toBe(null)
    })

    test('should default to empty features for email-only format', () => {
      const config = new PermissionConfig('user@example.com')
      const users = config.users

      expect(users[0].assignedFeatures).toEqual([])
    })

    test('should parse multiple email-only entries with semicolons', () => {
      const config = new PermissionConfig('user1@example.com;user2@example.com')
      const users = config.users

      expect(users).toHaveLength(2)
      expect(users[0].email).toBe('user1@example.com')
      expect(users[1].email).toBe('user2@example.com')
    })
  })

  describe('Role format parsing', () => {
    test('should parse email:role format with admin role', () => {
      const config = new PermissionConfig('admin@example.com:admin')
      const users = config.users

      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('admin@example.com')
      expect(users[0].role).toBe(Role.ADMIN)
    })

    test('should parse email:role format with management_admin role', () => {
      const config = new PermissionConfig('user@example.com:management_admin')
      const users = config.users

      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('user@example.com')
      expect(users[0].role).toBe(Role.MANAGEMENT_ADMIN)
    })

    test('should parse email:role format with blog_admin role', () => {
      const config = new PermissionConfig('user@example.com:blog_admin')
      const users = config.users

      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('user@example.com')
      expect(users[0].role).toBe(Role.BLOG_ADMIN)
    })

    test('should handle case-insensitive role parsing', () => {
      const config = new PermissionConfig('admin@example.com:ADMIN')
      const users = config.users

      expect(users[0].role).toBe(Role.ADMIN)
    })

    test('should default to null role for invalid role', () => {
      const config = new PermissionConfig('user@example.com:invalid')
      const users = config.users

      expect(users[0].role).toBe(null)
    })
  })

  describe('Backward compatibility', () => {
    test('should parse entries with semicolon separator', () => {
      const config = new PermissionConfig('admin@example.com:admin;user@example.com:blog_admin')
      const users = config.users

      expect(users).toHaveLength(2)
      expect(users[0].email).toBe('admin@example.com')
      expect(users[1].email).toBe('user@example.com')
    })
  })

  describe('Validation', () => {
    test('should validate successfully with no errors', () => {
      const config = new PermissionConfig('admin@example.com:admin')
      const result = config.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('should detect duplicate emails', () => {
      const config = new PermissionConfig('user@example.com:admin;user@example.com:blog_admin')
      const result = config.validate()

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Duplicate emails')
    })

    test('should validate empty environment variable', () => {
      const config = new PermissionConfig('')
      const result = config.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })
  })

  describe('getUserPermission', () => {
    test('should find user by email', () => {
      const config = new PermissionConfig('user@example.com:admin')
      const permission = config.getUserPermission('user@example.com')

      expect(permission).toBeDefined()
      expect(permission.email).toBe('user@example.com')
    })

    test('should handle case-insensitive email lookup', () => {
      const config = new PermissionConfig('user@example.com:admin')
      const permission = config.getUserPermission('USER@EXAMPLE.COM')

      expect(permission).toBeDefined()
      expect(permission.email).toBe('user@example.com')
    })

    test('should return undefined for non-existent user', () => {
      const config = new PermissionConfig('user@example.com:admin')
      const permission = config.getUserPermission('other@example.com')

      expect(permission).toBeUndefined()
    })
  })
})

describe('PermissionChecker', () => {
  describe('Admin access control', () => {
    test('should allow admin to access all features', () => {
      const config = new PermissionConfig('admin@example.com:admin')
      const checker = new PermissionChecker(config)

      AVAILABLE_FEATURES.forEach((feature) => {
        expect(checker.canAccessFeature('admin@example.com', feature)).toBe(true)
      })
    })

    test('should return all features for admin', () => {
      const config = new PermissionConfig('admin@example.com:admin')
      const checker = new PermissionChecker(config)

      const features = checker.getAccessibleFeatures('admin@example.com')
      expect(features).toEqual(AVAILABLE_FEATURES)
    })

    test('should identify admin role correctly', () => {
      const config = new PermissionConfig('admin@example.com:admin')
      const checker = new PermissionChecker(config)

      expect(checker.isAdmin('admin@example.com')).toBe(true)
      expect(checker.getUserRole('admin@example.com')).toBe(Role.ADMIN)
    })

    test('should allow admin to perform all actions', () => {
      const config = new PermissionConfig('admin@example.com:admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('admin@example.com', Actions.SCAN_INBOX)).toBe(true)
      expect(checker.canPerformAction('admin@example.com', Actions.EDIT_MEMBER)).toBe(true)
      expect(checker.canPerformAction('admin@example.com', Actions.EDIT_PAYMENT)).toBe(true)
      expect(checker.canPerformAction('admin@example.com', Actions.CREATE_ARTICLE)).toBe(true)
    })
  })

  describe('Management admin access control', () => {
    test('should allow management_admin to access all features (read-only)', () => {
      const config = new PermissionConfig('user@example.com:management_admin')
      const checker = new PermissionChecker(config)

      // Everyone can view all tabs
      AVAILABLE_FEATURES.forEach((feature) => {
        expect(checker.canAccessFeature('user@example.com', feature)).toBe(true)
      })
    })

    test('should allow management_admin to perform member and payment actions', () => {
      const config = new PermissionConfig('user@example.com:management_admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.EDIT_MEMBER)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.DELETE_MEMBER)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.DOWNLOAD_CSV_MEMBERS)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_PAYMENT)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.DOWNLOAD_CSV_PAYMENTS)).toBe(true)
    })

    test('should deny management_admin from performing article actions', () => {
      const config = new PermissionConfig('user@example.com:management_admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.CREATE_ARTICLE)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_ARTICLE)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.DELETE_ARTICLE)).toBe(false)
    })

    test('should deny management_admin from scanning inbox', () => {
      const config = new PermissionConfig('user@example.com:management_admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.SCAN_INBOX)).toBe(false)
    })
  })

  describe('Blog admin access control', () => {
    test('should allow blog_admin to access all features (read-only)', () => {
      const config = new PermissionConfig('user@example.com:blog_admin')
      const checker = new PermissionChecker(config)

      // Everyone can view all tabs
      AVAILABLE_FEATURES.forEach((feature) => {
        expect(checker.canAccessFeature('user@example.com', feature)).toBe(true)
      })
    })

    test('should allow blog_admin to perform article actions', () => {
      const config = new PermissionConfig('user@example.com:blog_admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.CREATE_ARTICLE)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_ARTICLE)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.PUBLISH_ARTICLE)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.DELETE_ARTICLE)).toBe(true)
    })

    test('should deny blog_admin from performing member and payment actions', () => {
      const config = new PermissionConfig('user@example.com:blog_admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.EDIT_MEMBER)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_PAYMENT)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.DOWNLOAD_CSV_MEMBERS)).toBe(false)
    })

    test('should deny blog_admin from scanning inbox', () => {
      const config = new PermissionConfig('user@example.com:blog_admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.SCAN_INBOX)).toBe(false)
    })
  })

  describe('Read-only user access control', () => {
    test('should allow read-only user to access all features (view only)', () => {
      const config = new PermissionConfig('user@example.com')
      const checker = new PermissionChecker(config)

      // Everyone can view all tabs
      AVAILABLE_FEATURES.forEach((feature) => {
        expect(checker.canAccessFeature('user@example.com', feature)).toBe(true)
      })
    })

    test('should deny read-only user from performing any actions', () => {
      const config = new PermissionConfig('user@example.com')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('user@example.com', Actions.SCAN_INBOX)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_MEMBER)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_PAYMENT)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.CREATE_ARTICLE)).toBe(false)
      expect(checker.canPerformAction('user@example.com', Actions.DOWNLOAD_CSV_MEMBERS)).toBe(false)
    })

    test('should return null role for read-only user', () => {
      const config = new PermissionConfig('user@example.com')
      const checker = new PermissionChecker(config)

      expect(checker.getUserRole('user@example.com')).toBe(null)
      expect(checker.isAdmin('user@example.com')).toBe(false)
    })

    test('should return all features for read-only user', () => {
      const config = new PermissionConfig('user@example.com')
      const checker = new PermissionChecker(config)

      const features = checker.getAccessibleFeatures('user@example.com')
      expect(features).toEqual(AVAILABLE_FEATURES)
    })
  })

  describe('Dashboard access', () => {
    test('should allow dashboard access for authorized users', () => {
      const config = new PermissionConfig('user@example.com')
      const checker = new PermissionChecker(config)

      expect(checker.canAccessDashboard('user@example.com')).toBe(true)
    })

    test('should deny dashboard access for unauthorized users', () => {
      const config = new PermissionConfig('user@example.com')
      const checker = new PermissionChecker(config)

      expect(checker.canAccessDashboard('other@example.com')).toBe(false)
    })
  })

  describe('Non-existent user', () => {
    test('should deny dashboard access for non-existent user', () => {
      const config = new PermissionConfig('user@example.com:admin')
      const checker = new PermissionChecker(config)

      expect(checker.canAccessDashboard('other@example.com')).toBe(false)
    })

    test('should deny feature access for non-existent user', () => {
      const config = new PermissionConfig('user@example.com:admin')
      const checker = new PermissionChecker(config)

      expect(checker.canAccessFeature('other@example.com', 'dashboard')).toBe(false)
    })

    test('should deny actions for non-existent user', () => {
      const config = new PermissionConfig('user@example.com:admin')
      const checker = new PermissionChecker(config)

      expect(checker.canPerformAction('other@example.com', Actions.EDIT_MEMBER)).toBe(false)
    })
  })
})

describe('Error handling', () => {
  describe('Invalid format handling', () => {
    test('should handle invalid role gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const config = new PermissionConfig('user@example.com:invalidrole')

      expect(config.users[0].role).toBe(null)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid role "invalidrole"'))

      consoleSpy.mockRestore()
    })

    test('should grant read-only access for users with invalid role', () => {
      const config = new PermissionConfig('user@example.com:invalidrole')
      const checker = new PermissionChecker(config)

      // User exists and can access dashboard (read-only)
      expect(checker.canAccessDashboard('user@example.com')).toBe(true)
      expect(checker.getUserRole('user@example.com')).toBe(null)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_MEMBER)).toBe(false)
    })
  })

  describe('Error response format', () => {
    test('should create unauthorized error with correct format', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const error = createUnauthorizedError('user@example.com')

      expect(error.code).toBe('UNAUTHORIZED')
      expect(error.message).toBe('User is not authorized to access the admin dashboard')
      expect(error.details.email).toBe('user@example.com')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unauthorized access attempt: user@example.com')
      )

      consoleSpy.mockRestore()
    })

    test('should create forbidden error with correct format', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const error = createForbiddenError('user@example.com', 'payments', ['dashboard', 'members'])

      expect(error.code).toBe('FORBIDDEN')
      expect(error.message).toBe('User does not have permission to access this feature')
      expect(error.details.email).toBe('user@example.com')
      expect(error.details.requestedFeature).toBe('payments')
      expect(error.details.availableFeatures).toEqual(['dashboard', 'members'])
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Forbidden access attempt'))

      consoleSpy.mockRestore()
    })
  })
})

describe('Permission integration', () => {
  describe('End-to-end permission flow', () => {
    test('should handle complete access control flow for admin', () => {
      const envValue = 'admin@example.com:admin;user@example.com:blog_admin'
      const config = new PermissionConfig(envValue)
      const checker = new PermissionChecker(config)

      // Admin should have full access
      expect(checker.canAccessDashboard('admin@example.com')).toBe(true)
      expect(checker.isAdmin('admin@example.com')).toBe(true)
      expect(checker.getAccessibleFeatures('admin@example.com')).toEqual(AVAILABLE_FEATURES)
      expect(checker.canAccessFeature('admin@example.com', 'payments')).toBe(true)
      expect(checker.canPerformAction('admin@example.com', Actions.SCAN_INBOX)).toBe(true)
    })

    test('should handle complete access control flow for blog_admin', () => {
      const envValue = 'admin@example.com:admin;user@example.com:blog_admin'
      const config = new PermissionConfig(envValue)
      const checker = new PermissionChecker(config)

      // Blog admin should have read access to all tabs but only write access to articles
      expect(checker.canAccessDashboard('user@example.com')).toBe(true)
      expect(checker.isAdmin('user@example.com')).toBe(false)
      expect(checker.getAccessibleFeatures('user@example.com')).toEqual(AVAILABLE_FEATURES)
      expect(checker.canAccessFeature('user@example.com', 'dashboard')).toBe(true)
      expect(checker.canAccessFeature('user@example.com', 'payments')).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.CREATE_ARTICLE)).toBe(true)
      expect(checker.canPerformAction('user@example.com', Actions.EDIT_PAYMENT)).toBe(false)
    })

    test('should handle mixed configuration with multiple users', () => {
      const envValue =
        'admin1@example.com:admin;admin2@example.com:admin;user1@example.com:management_admin;user2@example.com:blog_admin'
      const config = new PermissionConfig(envValue)
      const checker = new PermissionChecker(config)

      // Both admins should have full access
      expect(checker.isAdmin('admin1@example.com')).toBe(true)
      expect(checker.isAdmin('admin2@example.com')).toBe(true)

      // All users can view all features
      expect(checker.getAccessibleFeatures('user1@example.com')).toEqual(AVAILABLE_FEATURES)
      expect(checker.getAccessibleFeatures('user2@example.com')).toEqual(AVAILABLE_FEATURES)

      // But different action permissions
      expect(checker.canPerformAction('user1@example.com', Actions.EDIT_MEMBER)).toBe(true)
      expect(checker.canPerformAction('user1@example.com', Actions.CREATE_ARTICLE)).toBe(false)
      expect(checker.canPerformAction('user2@example.com', Actions.EDIT_MEMBER)).toBe(false)
      expect(checker.canPerformAction('user2@example.com', Actions.CREATE_ARTICLE)).toBe(true)
    })

    test('should validate configuration before use', () => {
      const envValue = 'admin@example.com:admin;user@example.com:blog_admin'
      const config = new PermissionConfig(envValue)

      const validation = config.validate()
      expect(validation.valid).toBe(true)

      const checker = new PermissionChecker(config)
      expect(checker.canAccessDashboard('admin@example.com')).toBe(true)
    })
  })

  describe('Backward compatibility', () => {
    test('should parse entries with semicolon separator', () => {
      const config = new PermissionConfig('admin@example.com:admin;user@example.com:blog_admin')
      const users = config.users

      expect(users).toHaveLength(2)
      expect(users[0].email).toBe('admin@example.com')
      expect(users[1].email).toBe('user@example.com')
    })
  })

  describe('Edge cases', () => {
    test('should handle empty environment variable', () => {
      const config = new PermissionConfig('')
      const checker = new PermissionChecker(config)

      expect(config.users).toHaveLength(0)
      expect(checker.canAccessDashboard('any@example.com')).toBe(false)
    })

    test('should handle undefined environment variable', () => {
      const config = new PermissionConfig(undefined)
      const checker = new PermissionChecker(config)

      expect(config.users).toHaveLength(0)
      expect(checker.canAccessDashboard('any@example.com')).toBe(false)
    })

    test('should handle whitespace-only entries', () => {
      const config = new PermissionConfig('  ;  ;  ')
      const checker = new PermissionChecker(config)

      expect(config.users).toHaveLength(0)
    })

    test('should normalize email addresses', () => {
      const config = new PermissionConfig('  USER@EXAMPLE.COM  :admin')
      const checker = new PermissionChecker(config)

      expect(checker.canAccessDashboard('user@example.com')).toBe(true)
      expect(checker.canAccessDashboard('USER@EXAMPLE.COM')).toBe(true)
    })
  })
})
