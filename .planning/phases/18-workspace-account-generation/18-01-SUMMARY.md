---
phase: 18-workspace-account-generation
plan: 01
subsystem: api
tags: [apps-script, google-workspace, mutation-hook, email-generation]

# Dependency graph
requires:
  - phase: 15-apps-script-web-app
    provides: "callAppsScript utility, Apps Script doPost pattern, setupServices"
  - phase: 16-dashboard-trigger-ui
    provides: "useManualPayment mutation hook pattern, manual-payment API route pattern"
provides:
  - "create_workspace_account Apps Script action handler"
  - "POST /api/admin/create-workspace-account API route"
  - "useCreateWorkspaceAccount mutation hook"
  - "generateEmailCandidates and sanitizeNamePart client-side utilities"
  - "firstName, initial, lastName, slastName fields in member API response"
affects: [18-02-workspace-account-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side email candidate generator mirroring Apps Script logic"
    - "Admin-selected sacEmail bypasses server-side availability check"

key-files:
  created:
    - app/api/admin/create-workspace-account/route.js
    - lib/workspace-email.js
  modified:
    - appsscript/CreateUser.js
    - lib/hooks/useAdminData.js
    - lib/google-sheets.js

key-decisions:
  - "Admin selects sacEmail from generated candidates; server trusts selection and skips createEmail availability check"
  - "Client-side email generator mirrors Apps Script sanitizeNamePartForEmail and generateEmailCandidates exactly"
  - "Member name parts split Apellidos column into apellido1/apellido2 using same regex as Apps Script"

patterns-established:
  - "Workspace account creation action pattern: lock -> setupServices -> createWorkspaceUser -> addUserToGroup -> sendWelcomeEmail -> update CLEAN sheet"
  - "Client-side utility mirroring server-side Apps Script logic for preview/candidate generation"

# Metrics
duration: 6min
completed: 2026-02-11
---

# Phase 18 Plan 01: Backend + Utility Summary

**Apps Script workspace account action, Next.js API proxy route, TanStack Query mutation hook, client-side email candidate generator, and member name parts in API response**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-11T18:48:10Z
- **Completed:** 2026-02-11T18:54:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full API chain wired: client hook -> Next.js route -> Apps Script -> Google Workspace account creation
- Email candidate generation logic ported to client-side lib/workspace-email.js matching Apps Script naming strategy
- Member objects now expose firstName, initial, lastName, slastName for the workspace account modal

## Task Commits

Each task was committed atomically:

1. **Task 1: Apps Script action handler + API proxy route** - `600b674` (feat)
2. **Task 2: Email candidate utility + mutation hook + member name parts** - `ccda312` (feat)

## Files Created/Modified
- `appsscript/CreateUser.js` - Added create_workspace_account case and handleCreateWorkspaceAccountAction function
- `app/api/admin/create-workspace-account/route.js` - POST endpoint with auth, validation, Apps Script proxy, cache invalidation
- `lib/workspace-email.js` - Client-side generateEmailCandidates and sanitizeNamePart utilities
- `lib/hooks/useAdminData.js` - Added useCreateWorkspaceAccount mutation hook
- `lib/google-sheets.js` - Added firstName, initial, lastName, slastName to member objects

## Decisions Made
- Admin selects sacEmail from generated candidates; the server trusts this selection and creates the user directly with the passed sacEmail (skipping the createEmail availability-check loop). This is intentional since the admin picks from candidates displayed in the UI.
- Client-side email generator uses the exact same sanitization and candidate generation logic as Apps Script to ensure consistency between preview and actual creation.
- Apellidos column split into primer/segundo apellido using the same `split(/[\s-]/)` regex as Apps Script for consistency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed prettier formatting in google-sheets.js**
- **Found during:** Task 2 (member name parts)
- **Issue:** Multi-line `const initial = ...` broke prettier rules, causing build failure
- **Fix:** Collapsed to single line to match prettier expectations
- **Files modified:** lib/google-sheets.js
- **Verification:** Build passes after fix
- **Committed in:** ccda312 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial formatting fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Apps Script web app must be redeployed manually after the CreateUser.js changes are pushed (existing known blocker from STATE.md).

## Next Phase Readiness
- All backend infrastructure ready for Plan 02 (UI modal)
- useCreateWorkspaceAccount hook ready for use in workspace account creation modal
- generateEmailCandidates ready for displaying email candidates in the modal
- Member name parts (firstName, initial, lastName, slastName) available in member API response

## Self-Check: PASSED

- All 5 files exist on disk
- Both task commits (600b674, ccda312) verified in git log
- Build compiles successfully

---
*Phase: 18-workspace-account-generation*
*Completed: 2026-02-11*
