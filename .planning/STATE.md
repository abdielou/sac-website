# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Admins can accurately track membership status and payments so that no member falls through the cracks.
**Current focus:** Phase 28 complete — ready for Phase 29

## Current Position

Phase: 28 (3 of 5 in v1.8) — Photo Storage & Member Profile
Plan: 4 of 4 in current phase
Status: Complete
Last activity: 2026-02-27 — Phase 28 verified and complete

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 64 (across v1.0-v1.8)
- Average duration: ~30 min
- Total execution time: ~27 hours
- 28-01: 3min, 2 tasks, 5 files
- 28-02: 3min, 2 tasks, 7 files
- 28-03: 3min, 2 tasks, 7 files
- 28-04: verification checkpoint, 11 issues fixed inline

**Recent Trend (v1.8):**
- 8 plans across 3 phases in 2 days
- Trend: Accelerating

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [28-04]: Phone number is read-only (intentional, not editable by members)
- [28-04]: SAC email matching added to getMemberByEmail and updateMemberProfile
- [28-04]: Drive scope changed from drive.file to drive for Shared Drive access
- [28-04]: supportsAllDrives=true on all Drive API calls
- [28-04]: Photos stored in uploads/ subfolder, not drive root
- [28-04]: getUserMedia for camera capture instead of capture="user" file input
- [28-04]: Location field changes clear geo_lat/geo_lng for geocoding re-generation
- [28-01]: Separate Drive JWT auth (drive scope) from Sheets auth (spreadsheets scope)
- [28-01]: getMemberByEmail reuses getMembers() cache rather than direct sheet query
- [28-01]: Photo proxy returns binary with Cache-Control private, max-age=3600
- [28-02]: Nav items use roles array for filtering; profile item always shown regardless of accessibleFeatures
- [28-02]: Old admin components kept temporarily for backward compatibility
- [28-03]: CropModal uses round cropShape for profile photo aesthetics
- [28-03]: Photo staged locally as Blob after crop, uploaded only on profile save
- [27-02]: Admin route checks ordered before member route checks in proxy.js for correct precedence
- [27-01]: isMember from JWT token, isAdmin from permissionChecker -- intentional dual source

### Research Flags

- Phase 26: VERIFIED - hybrid pages/ + app/ router works under --webpack after upgrade
- Phase 28: VERIFIED - Drive shared folder access via service account with Content manager permission
- Phase 29: Build @react-pdf/renderer proof-of-concept before full templates

### Blockers/Concerns

- Auth.js beta.30 peer dependency resolved cleanly (no longer a concern)

## Session Continuity

Last session: 2026-02-27
Stopped at: Phase 28 complete, ready for Phase 29
Resume file: .planning/phases/28-photo-storage-member-profile/28-04-SUMMARY.md
