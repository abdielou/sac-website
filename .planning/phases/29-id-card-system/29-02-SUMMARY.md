---
phase: 29-id-card-system
plan: 02
subsystem: ui
tags: [admin, members, photo-status, filter]

# Dependency graph
requires:
  - phase: 28-photo-storage-member-profile
    provides: photoFileId field in member data
provides:
  - Photo status column in COLUMN_REGISTRY
  - "Sin foto" filter pill in admin members list
  - Missing-photo indicators in table and mobile card views
affects: [29-id-card-system]

# Tech tracking
tech-stack:
  added: []
  patterns: [filter-pill-toggle, column-specific-cell-rendering]

key-files:
  created: []
  modified:
    - lib/admin/columnRegistry.js
    - app/admin/members/page.js

key-decisions:
  - "hasPhoto column defaultVisible: false -- opt-in via column selector to avoid clutter"
  - "Photo filter is independent toggle, not part of status multi-select"

patterns-established:
  - "Filter pill toggle: boolean state + className toggle for active/inactive styling"
  - "Column-specific cell rendering: check col.id in renderCellContent for custom JSX"

requirements-completed: [ID-05]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 29 Plan 02: Missing Photo Filter Summary

**Photo status column and "Sin foto" filter pill in admin members list using photoFileId from member data**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T21:55:01Z
- **Completed:** 2026-02-27T21:57:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- hasPhoto column in COLUMN_REGISTRY with Spanish labels ("Si" / "Sin foto")
- "Sin foto" toggle filter pill in members page filter bar (orange when active)
- Visual indicators in desktop table (green "Si" / orange warning icon + "Sin foto")
- Missing photo badge in mobile card layout next to member name

## Task Commits

Each task was committed atomically:

1. **Task 1: Add photo status column to column registry** - `315791c` (feat)
2. **Task 2: Add photo filter pill and missing-photo indicator** - `2c083ed` (feat)

## Files Created/Modified
- `lib/admin/columnRegistry.js` - Added hasPhoto column with photoFileId accessor and Spanish formatter
- `app/admin/members/page.js` - Added photoFilter state, filter pill, hasPhoto cell renderer, mobile badge

## Decisions Made
- hasPhoto column set to defaultVisible: false to avoid cluttering default view; admins opt in via column selector
- Photo filter implemented as independent boolean toggle rather than adding to the status multi-select

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admins can now identify members missing photos before ID card generation
- Ready for plan 03 (ID card PDF generation)

---
*Phase: 29-id-card-system*
*Completed: 2026-02-27*
