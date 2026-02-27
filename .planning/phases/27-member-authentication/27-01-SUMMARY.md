---
phase: 27-member-authentication
plan: 01
subsystem: auth
tags: [nextauth, google-oauth, session, jwt, member-auth]

# Dependency graph
requires:
  - phase: 26-nextjs-upgrade
    provides: "Auth.js v5 (next-auth beta.30) with proxy.js pattern"
provides:
  - "Dual-role signIn callback accepting admin-allowlist and @sociedadastronomia.com domain"
  - "isMember and isAdmin flags in JWT token"
  - "isMember exposed in session for client-side route protection"
  - "Updated sign-in page for dual-purpose member/admin login"
affects: [27-02, member-portal, route-protection]

# Tech tracking
tech-stack:
  added: []
  patterns: ["domain-based auth: email.endsWith('@sociedadastronomia.com') for member identification"]

key-files:
  created: []
  modified:
    - auth.js
    - app/auth/signin/page.js

key-decisions:
  - "isMember comes from JWT token, isAdmin comes from permissionChecker -- dual source is intentional"
  - "token.isAdmin in JWT is supplementary; session.user.isAdmin from permissionChecker remains authoritative"

patterns-established:
  - "Member auth via domain check: email.endsWith('@sociedadastronomia.com')"
  - "Role flags propagation: signIn -> jwt -> session"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 27 Plan 01: Auth Callbacks Summary

**Dual-role auth in auth.js accepting @sociedadastronomia.com members alongside admin-allowlist, with isMember/isAdmin flags in JWT and session**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T22:41:44Z
- **Completed:** 2026-02-26T22:43:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- auth.js signIn callback accepts both admin allowlist emails and @sociedadastronomia.com domain
- JWT token includes isMember and isAdmin flags set during initial sign-in
- Session exposes isMember flag for downstream route protection and UI
- Sign-in page updated with "Acceso SAC" heading, dual-purpose footer, and member-oriented error message

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend auth.js callbacks for member authentication** - `a6eaaba` (feat)
2. **Task 2: Update sign-in page for dual-purpose login** - `cfa54ee` (feat)

## Files Created/Modified
- `auth.js` - Added domain check in signIn, isMember/isAdmin in jwt, isMember in session
- `app/auth/signin/page.js` - Updated heading, error message, and footer for dual-purpose access

## Decisions Made
- isMember derived from JWT token (domain check at sign-in), isAdmin derived from permissionChecker (existing system) -- intentional dual source
- token.isAdmin added in JWT is supplementary for proxy.js use in Plan 02; session.user.isAdmin from permissionChecker remains the authoritative admin check

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth callbacks ready for Plan 02 route protection (proxy.js role-based redirect)
- isMember flag available in session for member portal pages
- No blockers

## Self-Check: PASSED

- auth.js: FOUND
- app/auth/signin/page.js: FOUND
- 27-01-SUMMARY.md: FOUND
- Commit a6eaaba: FOUND
- Commit cfa54ee: FOUND

---
*Phase: 27-member-authentication*
*Completed: 2026-02-26*
