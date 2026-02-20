---
phase: 24-map-view-side-panel
plan: 01
subsystem: ui
tags: [leaflet, react-leaflet, openstreetmap, map, toggle, localStorage]

# Dependency graph
requires:
  - phase: 23-geocoding-pipeline
    provides: geoLat/geoLng fields on member objects
provides:
  - ViewToggle component for grid/map switching
  - MembersMap component with Leaflet pins and popups
  - Integrated map view in members admin page
affects: [24-map-view-side-panel]

# Tech tracking
tech-stack:
  added: [leaflet@1.9.4, react-leaflet@5.0.0]
  patterns: [dynamic import with ssr:false for Leaflet, CDN CSS injection for node_modules CSS conflicts]

key-files:
  created:
    - components/admin/ViewToggle.js
    - components/admin/MembersMap.js
  modified:
    - app/admin/members/page.js

key-decisions:
  - "CDN for Leaflet CSS instead of node_modules import to avoid webpack file-loader conflict"
  - "Purely presentational ViewToggle (state managed in page component)"
  - "Pinned marker state via email identifier for hover/click popup behavior"

patterns-established:
  - "Leaflet CSS via CDN link injection in useEffect (avoids webpack conflicts)"
  - "localStorage persistence pattern for UI preferences"

requirements-completed: [UI-01, UI-02, MAP-01, MAP-02, MAP-03, MAP-04]

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 24 Plan 01: Map View & Toggle Summary

**Interactive Leaflet map with member pins, hover/click popups, and grid/map view toggle with localStorage persistence**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T16:51:53Z
- **Completed:** 2026-02-20T16:58:01Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- ViewToggle component with inline SVG icons for grid/map switching
- MembersMap with OpenStreetMap tiles, auto-fit bounds, and hover/click popup behavior
- Members page integration with conditional rendering and localStorage view persistence

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Leaflet and create ViewToggle component** - `bbef60f` (feat)
2. **Task 2: Create MembersMap component with pins and popups** - `0d59822` (feat)
3. **Task 2 fix: CDN for Leaflet CSS** - `b47a022` (fix)
4. **Task 3: Integrate view toggle and map into members page** - `384775d` (feat)

## Files Created/Modified
- `components/admin/ViewToggle.js` - Grid/map toggle buttons with inline SVG icons
- `components/admin/MembersMap.js` - Leaflet map with member pins, popups, and fit-bounds
- `app/admin/members/page.js` - View toggle integration, conditional rendering, localStorage persistence

## Decisions Made
- Used CDN link injection for Leaflet CSS instead of `import 'leaflet/dist/leaflet.css'` because the project's webpack `file-loader` rule for `.png` files conflicts with leaflet's CSS image references
- ViewToggle is purely presentational; all state (viewMode, localStorage) lives in the page component
- Pinned popup tracking uses member email as identifier

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Leaflet CSS import causes webpack build failure**
- **Found during:** Task 3 (build verification)
- **Issue:** `import 'leaflet/dist/leaflet.css'` failed because next.config.js file-loader rule intercepts .png image references inside leaflet CSS
- **Fix:** Replaced static CSS import with dynamic CDN link injection via useEffect
- **Files modified:** components/admin/MembersMap.js
- **Verification:** `npm run build` succeeds
- **Committed in:** b47a022

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for build success. No scope creep.

## Issues Encountered
- Leaflet was already installed from prior work on the feature branch, so npm install step was skipped

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Map view functional with member pins and popups
- Ready for plan 02 (side panel for member details)
- CSP headers already allow unpkg.com (via https: wildcard in img-src) and unsafe-inline styles

---
*Phase: 24-map-view-side-panel*
*Completed: 2026-02-20*
