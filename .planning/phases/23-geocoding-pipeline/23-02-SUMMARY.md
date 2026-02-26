---
phase: 23-geocoding-pipeline
plan: 02
subsystem: api
tags: [apps-script, geocoding, google-sheets, data-integrity]

# Dependency graph
requires:
  - phase: 23-geocoding-pipeline-01
    provides: "Geocoding library, API endpoint, geo fields in getMembers/writeGeoData"
provides:
  - "Geo column invalidation in mergeRowData when address changes"
  - "Protection of geo coordinates when address is unchanged"
affects: [map-view, members-admin]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Address-change detection triggers geo cache invalidation in Apps Script"]

key-files:
  created: []
  modified:
    - "appsscript/CreateUser.js"

key-decisions:
  - "Geo invalidation only in mergeRowData -- other operations are safe by design"
  - "Compare old vs new address values to avoid unnecessary invalidation on re-submissions"

patterns-established:
  - "Geo trigger headers: address-related columns that invalidate cached coordinates"
  - "Safety model: document which Apps Script operations are safe from geo column interference"

requirements-completed: [GEO-04, GEO-05]

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 23 Plan 02: Geo Column Invalidation Summary

**Apps Script mergeRowData wipes geo_lat/geo_lng on address change to trigger re-geocoding, with verified safety for all other operations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T14:30:00Z
- **Completed:** 2026-02-20T14:38:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- mergeRowData detects address column changes and wipes geo_lat/geo_lng to force re-geocoding
- mergeRowData preserves geo coordinates when address data is unchanged (re-submissions)
- Verified handleNewMemberships, handleManualPaymentAction, and handleCreateWorkspaceAccountAction do NOT touch geo columns
- Safety model documented with inline comments in CreateUser.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Add geo column invalidation to mergeRowData** - `f794e3e` (feat)
2. **Task 2: Verify geo column invalidation and Apps Script safety** - checkpoint approved, no commit needed

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `appsscript/CreateUser.js` - Added GEO_TRIGGER_HEADERS/GEO_COLUMNS constants and address-change detection in mergeRowData to wipe geo columns on address update

## Decisions Made
- Geo invalidation placed only in mergeRowData since it is the sole function writing member data to the CLEAN sheet
- Old vs new value comparison prevents unnecessary geo wipes on identical re-submissions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**Apps Script requires redeployment.** The mergeRowData changes in CreateUser.js will not take effect until the Apps Script web app is redeployed.

## Next Phase Readiness
- Geo column invalidation is in place, ensuring coordinates stay in sync with address data
- Ready for map view integration that reads geo_lat/geo_lng from the CLEAN sheet
- Apps Script must be redeployed for changes to take effect

## Self-Check: PASSED

- FOUND: appsscript/CreateUser.js
- FOUND: commit f794e3e

---
*Phase: 23-geocoding-pipeline*
*Completed: 2026-02-20*
