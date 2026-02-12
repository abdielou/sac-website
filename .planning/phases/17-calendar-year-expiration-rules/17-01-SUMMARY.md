---
phase: 17-calendar-year-expiration-rules
plan: 01
subsystem: api
tags: [membership, expiration, calendar-year, tdd, jest]

# Dependency graph
requires:
  - phase: 08-auth-google-sheets
    provides: getMembers function and calculateMembershipStatus usage
provides:
  - Calendar-year-based calculateMembershipStatus function
  - Comprehensive test suite for membership status logic (16 test cases)
  - Exported calculateMembershipStatus for direct testing
affects: [members-list, admin-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [UTC-based date comparison for timezone independence, injectable now parameter for test determinism]

key-files:
  created: [test/membership-status.test.js]
  modified: [lib/google-sheets.js]

key-decisions:
  - "Use UTC date methods throughout for timezone-independent behavior"
  - "Injectable now parameter instead of jest.useFakeTimers for simpler test setup"
  - "Mock google-spreadsheet, google-auth-library, and cache in tests to avoid ESM-only ky dependency"

patterns-established:
  - "UTC date comparison: use getUTCFullYear/getUTCMonth/getUTCDate for all membership date logic"
  - "Date.UTC construction: create dates with Date.UTC() for consistent timezone behavior"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 17 Plan 01: Calendar-Year Membership Status Summary

**Calendar-year membership expiration with H1/H2 payment rules, 2-month grace period, and 16 passing TDD tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T16:43:46Z
- **Completed:** 2026-02-11T16:48:37Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Replaced rolling 12-month expiration with calendar-year rules (H1 Jan-Jun covers same year, H2 Jul-Dec covers next year)
- Implemented 2-month grace period (Jan-Feb shows expiring-soon after Dec 31 coverage end)
- All 16 test cases pass covering EXP-01 through EXP-07 requirements
- Used UTC methods throughout for timezone-independent behavior
- No regressions in existing test suite

## Task Commits

Each task was committed atomically:

1. **Task 1: Write comprehensive test suite (TDD RED)** - `454528a` (test)
2. **Task 2: Implement calendar-year calculateMembershipStatus (TDD GREEN)** - `5863297` (feat)
3. **Task 3: Verify no regressions** - Verified inline (51 tests pass, 1 pre-existing gallery SVG failure)

_TDD flow: RED (16 failing tests) -> GREEN (16 passing tests). No refactor needed._

## Files Created/Modified
- `test/membership-status.test.js` - 16 test cases covering all 7 EXP requirements with UTC date assertions
- `lib/google-sheets.js` - Rewritten calculateMembershipStatus with calendar-year rules, UTC methods, injectable now param, and named export

## Decisions Made
- **UTC date methods:** Used getUTCFullYear/getUTCMonth/getUTCDate and Date.UTC() throughout to avoid timezone-dependent behavior on different server environments
- **Injectable now parameter:** Added optional `now` parameter defaulting to `new Date()` for test determinism, avoiding jest.useFakeTimers complexity
- **Jest module mocking:** Mocked google-spreadsheet, google-auth-library, and lib/cache in tests to bypass ESM-only `ky` dependency that prevents loading the full google-sheets module in Jest

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM-only ky dependency breaks Jest module loading**
- **Found during:** Task 1 (test suite creation)
- **Issue:** Importing from `lib/google-sheets.js` transitively loads `ky` (ESM-only module), causing Jest `SyntaxError: Cannot use import statement outside a module`
- **Fix:** Added `jest.mock()` calls for `google-spreadsheet`, `google-auth-library`, and `../lib/cache` at the top of the test file to stub heavy dependencies
- **Files modified:** test/membership-status.test.js
- **Verification:** Test suite loads and runs successfully
- **Committed in:** 454528a (Task 1 commit)

**2. [Rule 1 - Bug] Timezone-dependent date comparisons produced wrong results**
- **Found during:** Task 2 (implementation)
- **Issue:** Using `getMonth()`/`getFullYear()` (local time) with `Date.UTC()` test inputs caused 5 test failures. Jul 1 UTC became Jun 30 local (UTC-4), Mar 1 UTC became Feb 28 local
- **Fix:** Changed all date methods to UTC variants (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`) and created expiration dates with `Date.UTC()`. Updated test assertions to use UTC getters
- **Files modified:** lib/google-sheets.js, test/membership-status.test.js
- **Verification:** All 16 tests pass regardless of system timezone
- **Committed in:** 5863297 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes essential for correctness. No scope creep. UTC fix improves production reliability.

## Issues Encountered
- Pre-existing `gallery.test.js` failure (SVG import not configured in Jest) -- unrelated to this plan's changes

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Calendar-year status logic is complete and tested
- No UI changes needed (existing UI already handles active/expiring-soon/expired/applied statuses)
- Ready for Phase 18 or any follow-up plans

---
*Phase: 17-calendar-year-expiration-rules*
*Completed: 2026-02-11*
