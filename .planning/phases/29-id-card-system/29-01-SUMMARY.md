---
phase: 29-id-card-system
plan: 01
subsystem: api
tags: [react-pdf, qrcode, pdf-generation, id-card]

requires:
  - phase: 28-photo-storage-member-profile
    provides: "getPhoto() for member photos from Google Drive, getMemberByEmail()"
provides:
  - "@react-pdf/renderer PDF template with CR80 card dimensions"
  - "generateIdCardPdf() orchestrator for server-side PDF generation"
  - "Admin API endpoint GET /api/admin/members/{email}/id-card returning PDF"
  - "Public /verify/{email} page showing membership status"
  - "generateQrDataUrl() utility for QR code base64 generation"
affects: [29-02, 29-03, 29-04, member-profile]

tech-stack:
  added: ["@react-pdf/renderer@4.3.2", "qrcode@1.5.4"]
  patterns: ["serverExternalPackages for server-side PDF libs", "CR80 card dimensions (243pt x 153pt)", "parallel async data fetch before PDF render"]

key-files:
  created:
    - lib/id-card/IdCardDocument.js
    - lib/id-card/generateIdCard.js
    - app/api/admin/members/[email]/id-card/route.js
    - app/verify/[email]/page.js
  modified:
    - next.config.js
    - package.json

key-decisions:
  - "serverExternalPackages at top level (not experimental) for Next.js 16 compatibility"
  - "renderToStream preferred over renderToBuffer for reliability"
  - "Verification page shows name and status only, no sensitive data"

patterns-established:
  - "PDF generation: fetch all async data in parallel, then render (prevents race conditions)"
  - "Year-versioned background: optional id-bg-{year}.png fallback to solid color"

requirements-completed: [ID-01, ID-02, ID-03]

duration: 3min
completed: 2026-02-27
---

# Phase 29 Plan 01: ID Card Pipeline Summary

**Server-side PDF ID card generation with @react-pdf/renderer, QR verification codes, admin API endpoint, and public membership verification page**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T21:55:03Z
- **Completed:** 2026-02-27T21:58:11Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- CR80-sized PDF template with SAC branding, member photo, name, year, and QR code
- Admin-only API endpoint generating PDF ID cards with proper auth guards
- Public verification page at /verify/{email} showing membership status without sensitive data
- QR codes on cards link to verification page for instant membership confirmation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create PDF template + QR utility** - `26b164b` (feat)
2. **Task 2: Create admin PDF API endpoint and public verification page** - `b307ede` (feat)

## Files Created/Modified
- `lib/id-card/IdCardDocument.js` - @react-pdf/renderer PDF template with CR80 dimensions
- `lib/id-card/generateIdCard.js` - Orchestrator: parallel photo/QR fetch, then PDF render
- `app/api/admin/members/[email]/id-card/route.js` - Admin GET endpoint returning PDF binary
- `app/verify/[email]/page.js` - Public server component showing membership verification
- `next.config.js` - Added serverExternalPackages for @react-pdf/renderer
- `package.json` - Added @react-pdf/renderer and qrcode dependencies

## Decisions Made
- Used serverExternalPackages at top level (not experimental) per Next.js 16 config
- Preferred renderToStream over renderToBuffer for known reliability in Next.js
- Verification page exposes only name and membership status (no email, phone, or address)
- Vigencia year derived from member.expirationDate, with fallback to current year

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Stale .next/lock file from previous build caused initial build failure; resolved by removing lock and cleaning .next directory

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PDF generation pipeline ready for browser preview component (plan 02)
- Admin endpoint ready for integration with members list UI (plan 03)
- Verification page live at /verify/{email} for QR code destinations

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (26b164b, b307ede) confirmed in git log.

---
*Phase: 29-id-card-system*
*Completed: 2026-02-27*
