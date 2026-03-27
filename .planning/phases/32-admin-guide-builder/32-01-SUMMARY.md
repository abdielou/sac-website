---
phase: 32-admin-guide-builder
plan: 01
subsystem: api
tags: [s3, guides, crud, permissions, catalog-search]

requires:
  - phase: 31-catalog-storage
    provides: catalog.js search functions and guides-s3.js S3 storage layer
provides:
  - Guide business logic layer (lib/guides.js) with CRUD operations
  - Catalog search API endpoint for admin UI
  - Guide CRUD API routes (list, create, get, update, delete)
  - Guide permissions (CREATE/EDIT/PUBLISH/DELETE_GUIDE)
  - Sidebar navigation for guides
affects: [32-02-admin-guide-builder]

tech-stack:
  added: []
  patterns: [guide-api-follows-article-pattern, slug-generation-with-timestamp]

key-files:
  created:
    - lib/guides.js
    - app/api/admin/catalog/search/route.js
    - app/api/admin/guides/route.js
    - app/api/admin/guides/[slug]/route.js
  modified:
    - lib/permissions.js
    - components/admin/AdminSidebar.js

key-decisions:
  - "Guide slug generation uses NFD normalization + timestamp suffix for uniqueness"
  - "Guide types validated as 'galaxies' or 'objects' at API level"
  - "Blog admin role gets full guide permissions (same content management scope)"

patterns-established:
  - "Guide API mirrors article API: same auth pattern, Spanish errors, permission checks"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-05, ADMIN-06]

duration: 3min
completed: 2026-03-27
---

# Phase 32 Plan 01: Guide API & Permissions Summary

**Guide CRUD API with catalog search endpoint, business logic layer wrapping S3, and role-based permissions for admin/blog_admin**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-27T10:29:34Z
- **Completed:** 2026-03-27T10:32:47Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Guide business logic layer with slug generation, index management, and full CRUD
- Catalog search API endpoint for admin guide builder to find celestial objects
- Guide CRUD API routes following the established article API pattern
- Permission system extended with 4 guide actions for admin and blog_admin roles
- Admin sidebar updated with Guias navigation entry

## Task Commits

Each task was committed atomically:

1. **Task 1: Guide business logic and permissions setup** - `d867818` (feat)
2. **Task 2: API routes for catalog search and guide CRUD** - `9e23153` (feat)

## Files Created/Modified
- `lib/guides.js` - Business logic layer: listGuides, getGuide, createGuide, updateGuide, deleteGuide
- `app/api/admin/catalog/search/route.js` - GET endpoint for catalog text search with type/limit filters
- `app/api/admin/guides/route.js` - GET (list) and POST (create) guide endpoints
- `app/api/admin/guides/[slug]/route.js` - GET, PUT, DELETE single guide endpoints
- `lib/permissions.js` - Added guide actions and 'guides' feature to admin/blog_admin roles
- `components/admin/AdminSidebar.js` - Added Guias nav item with eye icon

## Decisions Made
- Guide slug generation uses NFD normalization to strip diacritics plus Date.now() timestamp suffix for uniqueness
- Guide types validated as 'galaxies' or 'objects' at the API layer (400 error for invalid types)
- Blog admin role gets full guide permissions since guides are content management like articles
- Catalog search requires no specific permission beyond auth (read-only reference data)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All API endpoints ready for Plan 02 (admin UI) to consume
- Catalog search returns objects matching the data shape expected by the guide editor
- Permissions and sidebar navigation in place for the guides admin page

---
*Phase: 32-admin-guide-builder*
*Completed: 2026-03-27*
