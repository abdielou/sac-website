# Implementation Plan: admin-role-permissions

## Overview

This implementation plan extends the existing authentication system in `auth.js` to support role-based permissions for the admin dashboard. The system will introduce two roles: admin (full access to all features) and restricted (access to specific features only). The implementation maintains backward compatibility with the existing `AUTHORIZED_ADMIN_EMAILS` environment variable by extending its format to include role and feature assignments.

The implementation follows the design document and uses JavaScript to match the existing codebase. Jest is used for testing with property-based testing approach.

## Tasks

- [x] 1. Extend environment variable parsing to support role-based format
  - Modify `parseAuthorizedEmails` function in `auth.js` to handle new format
  - Support format: "email", "email:role", "email:role:feature1,feature2"
  - Maintain backward compatibility with existing comma-separated email format
  - Add validation for role values (admin/restricted)
  - Add validation for feature names
  - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3, 3.4, 5.2_

- [x] 2. Create role-based permission checking functions
  - Add `parseRoleFromEntry` function to extract role from entry
  - Add `parseFeaturesFromEntry` function to extract feature assignments
  - Add `getUserRole` function to get user's role
  - Add `getUserFeatures` function to get user's assigned features
  - Add `isAdmin` function to check if user has admin role
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Implement access control enforcement
  - Add `canAccessDashboard` function to check dashboard access
  - Add `canAccessFeature` function to check specific feature access
  - Add `getAccessibleFeatures` function to get user's accessible features
  - Integrate with NextAuth signIn callback for initial access check
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Create permission configuration module
  - Extract permission logic into separate module `lib/permissions.js`
  - Create `PermissionConfig` class for parsing and validation
  - Create `Role` constants and utilities
  - Create `PermissionChecker` class for access control
  - Export functions for use in components and API routes
  - _Requirements: 2.2, 5.1, 5.3_

- [x] 5. Integrate with admin navigation
  - Modify `AdminNavTabs` component to filter features based on user permissions
  - Add permission check to sidebar navigation
  - Add feature-level access control in admin pages
  - Show/hide features based on user's assigned features
  - _Requirements: 1.4, 4.2, 4.3_

- [x] 6. Add error handling and logging
  - Add proper error logging for invalid formats
  - Add warning logging for invalid feature assignments
  - Create error response format for access denials
  - Add validation error handling
  - _Requirements: 2.4, 4.4, 5.3_

- [x] 7. Write unit tests for permission parsing
  - [x] 7.1 Test email-only format parsing
    - Test parsing "email" format
    - Test default role assignment (restricted)
    - Test default feature assignment (empty)
    - _Requirements: 3.3, 3.4_

  - [x] 7.2 Test role format parsing
    - Test parsing "email:role" format
    - Test admin role parsing
    - Test restricted role parsing
    - _Requirements: 3.1, 3.2_

  - [x] 7.3 Test feature assignment parsing
    - Test parsing "email:role:features" format
    - Test multiple feature parsing
    - Test feature validation against available features
    - _Requirements: 3.2, 5.2_

  - [ ]* 7.4 Write property test for format parsing
    - **Property 3: Environment variable parsing preserves configuration**
    - **Validates: Requirements 2.1, 2.3, 3.1, 3.2, 3.3**

- [x] 8. Write unit tests for access control
  - [x] 8.1 Test admin access control
    - Test admin can access all features
    - Test admin access is not affected by feature assignments
    - _Requirements: 1.1, 1.3, 4.1_

  - [x] 8.2 Test restricted access control
    - Test restricted user can access assigned features
    - Test restricted user cannot access unassigned features
    - Test restricted user with no assignments has no access
    - _Requirements: 1.2, 1.4, 4.2, 4.3_

  - [x] 8.3 Test default behavior
    - Test default role for email-only entries
    - Test default features for restricted users
    - _Requirements: 3.3, 3.4_

  - [ ]* 8.4 Write property test for access control
    - **Property 1: Admin users have unrestricted feature access**
    - **Validates: Requirements 1.1, 1.3, 4.1**
    - **Property 2: Restricted users have limited feature access**
    - **Validates: Requirements 1.2, 1.4, 4.2, 4.3**

- [x] 9. Write unit tests for error handling
  - [x] 9.1 Test invalid format handling
    - Test error logging for invalid formats
    - Test access denial for invalid configurations
    - _Requirements: 2.4_

  - [x] 9.2 Test invalid feature handling
    - Test warning logging for invalid features
    - Test invalid features are not granted access
    - _Requirements: 5.2, 5.3_

  - [ ]* 9.3 Write property test for error handling
    - **Property 5: Invalid format handling**
    - **Validates: Requirements 2.4**
    - **Property 6: Feature validation prevents invalid assignments**
    - **Validates: Requirements 5.2, 5.3**

- [x] 10. Write unit tests for permission integration
  - [x] 10.1 Test end-to-end permission flow
    - Test complete access control flow
    - Test environment variable integration
    - _Requirements: 2.2, 4.4_

  - [ ]* 10.2 Write property test for permission integration
    - **Property 4: Default role and feature assignments**
    - **Validates: Requirements 3.3, 3.4**
    - **Property 7: Access denial returns error response**
    - **Validates: Requirements 4.4**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Update environment configuration documentation
  - Update .env.template with new format examples
  - Add documentation for role-based permission format
  - Add examples for admin and restricted user configurations
  - _Requirements: 2.1, 3.1, 3.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation extends the existing `auth.js` system for backward compatibility
- Admin features are: Dashboard, Members, Payments, Articles