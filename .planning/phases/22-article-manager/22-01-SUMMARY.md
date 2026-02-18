---
phase: 22-article-manager
plan: 01
subsystem: api, ui
tags: [s3, crud, admin, articles, image-upload, next-api-routes]

# Dependency graph
requires:
  - phase: 19-s3-article-data-layer
    provides: "lib/articles.js CRUD functions (createArticle, getArticle, updateArticle, deleteArticle, listArticles)"
provides:
  - "GET/POST /api/admin/articles for listing and creating articles"
  - "GET/PUT/DELETE /api/admin/articles/[...slug] for single article operations"
  - "POST /api/admin/articles/upload-image for S3 image upload with public-read ACL"
  - "Article list page at /admin/articles with rich card layout, filters, and pagination"
  - "Sidebar and mobile nav tabs with Articulos nav item"
affects: [22-02-article-editor]

# Tech tracking
tech-stack:
  added: []
  patterns: [admin-api-auth-pattern, url-based-filter-state, s3-image-upload]

key-files:
  created:
    - app/api/admin/articles/route.js
    - app/api/admin/articles/[...slug]/route.js
    - app/api/admin/articles/upload-image/route.js
    - app/admin/articles/page.js
  modified:
    - components/admin/AdminSidebar.js
    - components/admin/AdminNavTabs.js

key-decisions:
  - "Used eslint-disable for <img> in article thumbnails since images are dynamic S3 URLs not suitable for next/image optimization"
  - "Fetch all tags in a separate request on mount to populate tag filter dropdown completely (not just from current page)"
  - "Used useState+useEffect+fetch pattern for data fetching (not TanStack Query) as articles use S3 not Google Sheets"
  - "Params await pattern for catch-all slug route to support Next.js 15 async params"
  - "Sort by lastmod descending (falling back to date) for most-recently-edited-first ordering"

patterns-established:
  - "Article API auth pattern: import auth from relative path, wrap handlers, check req.auth with Spanish 401 message"
  - "Catch-all slug route: [...slug] joined with '/' for date-path slugs like 2024/01/15/title"
  - "S3 image upload: FormData + validation + date-based key generation + public-read ACL"

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 22 Plan 01: Article CRUD API & List Page Summary

**Admin article CRUD API endpoints wrapping S3 data layer, image upload to S3, and rich article list page with status/search/tag filters**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T21:15:27Z
- **Completed:** 2026-02-17T21:22:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- 6 API endpoint handlers (GET list, POST create, GET single, PUT update, DELETE, POST upload-image) with auth protection and Spanish error messages
- Article list page with rich card layout: thumbnail, title, date, author, summary, status badge, tags per row
- Three filter mechanisms: status toggle pills, debounced title search, tag dropdown
- Image upload endpoint with MIME validation, size limit (10MB), date-based S3 key generation, and public-read ACL
- Sidebar and mobile nav tabs updated with "Articulos" navigation item

## Task Commits

Each task was committed atomically:

1. **Task 1: Article CRUD API routes and image upload endpoint** - `ba5f3a1` (feat)
2. **Task 2: Article list page with filters and sidebar integration** - `d82ae51` (feat)

## Files Created/Modified
- `app/api/admin/articles/route.js` - GET (list with filters/pagination) and POST (create article) endpoints
- `app/api/admin/articles/[...slug]/route.js` - GET (single), PUT (update), DELETE endpoints for articles by slug
- `app/api/admin/articles/upload-image/route.js` - POST endpoint for S3 image upload with validation
- `app/admin/articles/page.js` - Article list page with rich cards, filters, pagination, empty/loading/error states
- `components/admin/AdminSidebar.js` - Added Articulos nav item with document-text icon
- `components/admin/AdminNavTabs.js` - Added Articulos mobile nav tab

## Decisions Made
- Used `eslint-disable` for `<img>` in article thumbnails since these are dynamic S3 URLs not optimizable by `next/image`
- Fetched all tags separately on mount to populate the complete tag dropdown (not just tags from filtered results)
- Kept simple `useState+useEffect+fetch` pattern rather than TanStack Query for article data fetching
- Used `await params` in catch-all slug route for Next.js 15 async params compatibility
- S3 image upload uses `S3_IMAGES_BUCKET_NAME` env var (separate from article storage bucket)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prettier formatting on short NextResponse.json calls**
- **Found during:** Task 1 (API routes)
- **Issue:** Prettier required single-line formatting for short NextResponse.json calls
- **Fix:** Ran `eslint --fix` to auto-format
- **Files modified:** All 3 API route files
- **Verification:** `npx eslint app/api/admin/articles/` passes clean
- **Committed in:** ba5f3a1 (Task 1 commit)

**2. [Rule 1 - Bug] Next.js 15 async params in catch-all route**
- **Found during:** Task 1 (API routes)
- **Issue:** Next.js 15 requires `await params` before accessing route parameters
- **Fix:** Added `const resolvedParams = await params` before accessing `.slug`
- **Files modified:** `app/api/admin/articles/[...slug]/route.js`
- **Committed in:** ba5f3a1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor formatting and compatibility fixes. No scope creep.

## Issues Encountered
None - build succeeds, ESLint clean, all routes registered correctly.

## User Setup Required

**S3 image upload requires configuration:**
- `S3_IMAGES_BUCKET_NAME` env var must be set for image uploads to work
- The bucket should allow public-read ACL on objects
- Existing AWS credentials (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are reused

## Next Phase Readiness
- All API endpoints ready for the article editor (Plan 22-02)
- List page navigates to `/admin/articles/edit/{slug}` (editor) and `/admin/articles/new` (create)
- Upload endpoint ready for editor's image insertion and featured image picker

## Self-Check: PASSED

- [x] app/api/admin/articles/route.js exists
- [x] app/api/admin/articles/[...slug]/route.js exists
- [x] app/api/admin/articles/upload-image/route.js exists
- [x] app/admin/articles/page.js exists
- [x] Commit ba5f3a1 found
- [x] Commit d82ae51 found
- [x] AdminSidebar has Articulos nav item
- [x] AdminNavTabs has Articulos nav item
- [x] npm run build passes

---
*Phase: 22-article-manager*
*Completed: 2026-02-17*
