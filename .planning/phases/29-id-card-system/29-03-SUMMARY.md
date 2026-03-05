---
phase: 29-id-card-system
plan: 03
subsystem: ui
tags: [id-card, profile, preview, tailwind, pdf-download]

requires:
  - phase: 29-id-card-system
    provides: "generateIdCardPdf() for server-side PDF generation, IdCardDocument template"
provides:
  - "IdCardPreview browser component showing member ID card on profile page"
  - "Member-facing /api/member/id-card endpoint for self-service PDF download"
  - "/id redirect to /member/profile for backward compatibility"
affects: [29-04, member-profile]

tech-stack:
  added: []
  patterns: ["Browser HTML/Tailwind ID card preview mirroring PDF design", "Member self-service PDF download with session-scoped auth"]

key-files:
  created:
    - components/member/IdCardPreview.js
    - app/api/member/id-card/route.js
  modified:
    - app/member/profile/page.js
    - app/id/page.js

key-decisions:
  - "IdCardPreview uses HTML/Tailwind (not @react-pdf/renderer) for browser rendering"
  - "QR code shows placeholder in browser preview; actual QR only in PDF"
  - "Member PDF download requires active or expiring-soon status"

patterns-established:
  - "Member self-service endpoints: auth from session, no email param needed"

requirements-completed: [PROF-06, CLEAN-01]

duration: 3min
completed: 2026-02-27
---

# Phase 29 Plan 03: ID Card Preview & Profile Integration Summary

**Browser ID card preview on member profile page with self-service PDF download and old /id mock page removed**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T22:00:47Z
- **Completed:** 2026-02-27T22:03:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ID card preview rendered in browser using HTML/Tailwind matching the PDF template design
- Member-facing PDF download endpoint with session-scoped auth and active membership check
- Old mock /id page deleted and replaced with redirect to /member/profile
- Inactive members see dimmed card with DRAFT watermark and disabled download

## Task Commits

Each task was committed atomically:

1. **Task 1: Create browser ID card preview component and add to profile page** - `a0c8fac` (feat)
2. **Task 2: Remove old /id page and MemberIdCard component** - `36e320f` (chore)

## Files Created/Modified
- `components/member/IdCardPreview.js` - Browser HTML/Tailwind ID card preview with photo, name, year, QR placeholder
- `app/api/member/id-card/route.js` - Member-facing PDF download endpoint (session auth, active status required)
- `app/member/profile/page.js` - Added IdCardPreview section below profile content
- `app/id/page.js` - Replaced old mock ID builder with redirect to /member/profile
- `components/MemberIdCard.js` - Deleted (old mock component, no longer needed)

## Decisions Made
- Used HTML/Tailwind for browser preview rather than trying to render @react-pdf/renderer in browser
- QR code shown as placeholder text in preview; actual QR only appears in downloaded PDF
- Member PDF download requires active or expiring-soon status; inactive members get 403

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ID card preview visible on member profile page
- PDF download working for active members via /api/member/id-card
- Ready for plan 04 (admin batch operations or final verification)

---
*Phase: 29-id-card-system*
*Completed: 2026-02-27*
