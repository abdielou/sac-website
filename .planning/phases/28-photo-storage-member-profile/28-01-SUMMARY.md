---
phase: 28-photo-storage-member-profile
plan: 01
subsystem: api
tags: [google-drive, google-sheets, profile, photo-upload, rest-api]

requires:
  - phase: 27-nextjs16-auth-migration
    provides: Auth.js auth() wrapper and proxy.js route protection
provides:
  - Google Drive upload/download/rename utility (lib/google-drive.js)
  - getMemberByEmail and updateMemberProfile sheet functions
  - GET/PUT /api/member/profile endpoints
  - GET /api/member/photo/[email] proxy endpoint
affects: [28-02, 28-03, 28-04, 29-id-cards]

tech-stack:
  added: [google-drive-rest-api-v3]
  patterns: [drive-jwt-auth, multipart-upload, photo-proxy, scope-guard-api]

key-files:
  created:
    - lib/google-drive.js
    - app/api/member/profile/route.js
    - app/api/member/photo/[email]/route.js
  modified:
    - lib/google-sheets.js
    - .env.template

key-decisions:
  - "Separate Drive JWT auth from Sheets auth (drive.file scope vs spreadsheets scope)"
  - "getMemberByEmail reuses getMembers() cache rather than direct sheet query"
  - "Photo proxy returns binary with Cache-Control private, max-age=3600"

patterns-established:
  - "Scope-guarded member API: email always from session, never from body"
  - "Drive multipart upload with Buffer.concat for binary safety"
  - "Old photo archived via rename before new upload (no data loss)"

requirements-completed: [PHOTO-01, PHOTO-02, PHOTO-03, PROF-01, PROF-02, PROF-03]

duration: 3min
completed: 2026-02-27
---

# Phase 28 Plan 01: Backend API Foundation Summary

**Google Drive photo storage utility, spreadsheet profile read/write, and 3 member API endpoints (profile GET/PUT, photo proxy GET)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T00:40:53Z
- **Completed:** 2026-02-27T00:43:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created Google Drive REST API v3 utility with upload, download, and rename functions using separate JWT auth (drive.file scope)
- Added getMemberByEmail and updateMemberProfile to google-sheets.js, reusing existing cache and patterns
- Built scope-guarded member profile API with GET (read own profile) and PUT (update fields + optional photo upload)
- Built photo proxy route that serves Drive-stored images to authenticated members without exposing Drive URLs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Google Drive utility and extend Google Sheets** - `d53c091` (feat)
2. **Task 2: Create member profile and photo API routes** - `386baab` (feat)

## Files Created/Modified
- `lib/google-drive.js` - Drive REST API v3 utility: uploadPhoto, getPhoto, renameFile with JWT auth
- `lib/google-sheets.js` - Added getMemberByEmail (cache-backed lookup), updateMemberProfile (field mapping + column creation), photoFileId extraction in getMembers
- `app/api/member/profile/route.js` - GET own profile, PUT update profile with optional multipart photo
- `app/api/member/photo/[email]/route.js` - Photo proxy from Drive with auth and caching headers
- `.env.template` - Added GOOGLE_DRIVE_PHOTOS_FOLDER_ID variable

## Decisions Made
- Separate `createDriveAuth()` in google-drive.js with `drive.file` scope, distinct from sheets auth
- `getMemberByEmail` reuses `getMembers()` cache for efficiency rather than querying the sheet directly
- Profile PUT accepts both `multipart/form-data` (with photo) and `application/json` (fields only)
- Photo file naming convention: `{email}.jpg` with old versions renamed to `{email}_backup_{timestamp}.jpg`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added photoFileId extraction to getMembers()**
- **Found during:** Task 2 (API routes)
- **Issue:** getMembers() did not extract the photoFileId column from spreadsheet rows, so getMemberByEmail would never return photoFileId data
- **Fix:** Added `row.get('photoFileId')` extraction and included it in the returned member object
- **Files modified:** lib/google-sheets.js
- **Verification:** Field present in getMembers return object
- **Committed in:** 386baab (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for profile photo feature to function. No scope creep.

## Issues Encountered
None

## User Setup Required

The plan's `user_setup` section specifies configuration needed:
- Create a Google Drive folder for profile photos
- Share the folder with the service account email (as Editor)
- Set `GOOGLE_DRIVE_PHOTOS_FOLDER_ID` env variable to the folder ID from the URL

## Next Phase Readiness
- All backend API infrastructure ready for the member profile UI (Plan 02)
- Profile GET/PUT endpoints ready for TanStack Query hooks
- Photo proxy ready for `<img>` src attribute usage

---
*Phase: 28-photo-storage-member-profile*
*Completed: 2026-02-27*

## Self-Check: PASSED
