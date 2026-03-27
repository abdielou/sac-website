---
phase: 31-object-catalog-storage
plan: 01
subsystem: data
tags: [openngc, stellarium, catalog, astronomy, json, search]

requires: []
provides:
  - "OpenNGC JSON catalog with 13962 deep-sky objects"
  - "Spanish common name translations from Stellarium (493 objects)"
  - "Catalog search library (searchCatalog, getObjectById, getCatalogStats)"
affects: [32-guide-builder-ui, 33-guide-storage, 34-guide-display]

tech-stack:
  added: []
  patterns: [build-script-fetch-and-parse, singleton-catalog-cache, ranked-search-scoring]

key-files:
  created:
    - scripts/build-catalog.mjs
    - data/catalog/openngc.json
    - data/catalog/spanish-names.json
    - lib/catalog.js
    - test/catalog.test.js
  modified: []

key-decisions:
  - "Used fs.readFileSync for catalog loading instead of JSON import (Node 24 requires import attributes for JSON)"
  - "OpenNGC database_files path (repo restructured from database/ to database_files/)"
  - "Stellarium stellarium-sky/es.po used for Spanish translations (nebulae-specific .po not available)"
  - "Display names strip leading zeros (NGC 224 not NGC 0224, M 31 not M 031)"

patterns-established:
  - "Catalog singleton: loadCatalog() lazy-loads 13K objects once, reused across calls"
  - "Ranked search: exact ID match (100) > exact name (90) > partial ID (70) > partial name (50) > common name (40)"

requirements-completed: [DATA-01, DATA-02]

duration: 8min
completed: 2026-03-27
---

# Phase 31 Plan 01: Object Catalog Storage Summary

**OpenNGC catalog (13962 objects) with Stellarium Spanish names and ranked search utilities for observing guide builder**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T02:23:29Z
- **Completed:** 2026-03-27T02:31:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built catalog generation script that fetches OpenNGC CSV and Stellarium Spanish translations
- Generated JSON catalog with 13962 deep-sky objects (RA/Dec, magnitude, angular size, type, constellation)
- 493 objects have Spanish common names (Andromeda, Orion Nebula, etc.)
- Search library supports ranked matching by catalog ID, name, and common name in English/Spanish

## Task Commits

Each task was committed atomically:

1. **Task 1: Build catalog generation script and produce JSON catalog** (TDD)
   - `90e7265` (test) - Failing tests for catalog data integrity
   - `a6fc181` (feat) - Build script, JSON catalog, Spanish names
2. **Task 2: Create catalog search utility library** - `74e66ca` (feat)

## Files Created/Modified
- `scripts/build-catalog.mjs` - Downloads OpenNGC CSV + Stellarium .po, generates JSON catalog
- `data/catalog/openngc.json` - Full 13962-object catalog as JSON array
- `data/catalog/spanish-names.json` - English-to-Spanish name mapping (1272 entries)
- `lib/catalog.js` - searchCatalog, getObjectById, getCatalogStats exports
- `test/catalog.test.js` - Data integrity tests (6 tests)

## Decisions Made
- Used `fs.readFileSync` for catalog loading instead of JSON import to avoid Node 24 import attribute requirement while remaining compatible with Next.js webpack bundling
- OpenNGC repo restructured: CSV is at `database_files/NGC.csv` (not `database/NGC.csv`)
- Stellarium `stellarium-sky/es.po` contains DSO name translations (the nebulae-specific .po path no longer exists)
- Display names strip leading zeros for readability (NGC 224, M 31 vs NGC 0224, M 031)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OpenNGC CSV URL 404**
- **Found during:** Task 1
- **Issue:** Plan specified `database/NGC.csv` but repo restructured to `database_files/NGC.csv`
- **Fix:** Updated URL to correct path
- **Files modified:** scripts/build-catalog.mjs
- **Committed in:** a6fc181

**2. [Rule 3 - Blocking] Stellarium nebulae es.po URL 404**
- **Found during:** Task 1
- **Issue:** `po/stellarium-nebulae/es.po` does not exist; DSO translations are in `po/stellarium-sky/es.po`
- **Fix:** Updated URL to correct path
- **Files modified:** scripts/build-catalog.mjs
- **Committed in:** a6fc181

**3. [Rule 1 - Bug] Node 24 JSON import attribute requirement**
- **Found during:** Task 2
- **Issue:** `import data from './file.json'` fails in Node 24 without `with { type: 'json' }`
- **Fix:** Used `fs.readFileSync` + `JSON.parse` for catalog loading
- **Files modified:** lib/catalog.js
- **Committed in:** 74e66ca

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes necessary to reach working state. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Catalog data and search utilities ready for guide builder UI (Phase 32)
- `searchCatalog()` provides ranked results for object selection in guide creation
- `getObjectById()` enables direct lookup for guide object references
- `getCatalogStats()` available for admin dashboard statistics

---
*Phase: 31-object-catalog-storage*
*Completed: 2026-03-27*
