# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** v1.7 Members Map View — Phase 23 Geocoding Pipeline

## Current Position

Phase: 23 of 25 (Geocoding Pipeline)
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase Complete
Last activity: 2026-02-20 — Completed 23-02 Geo Column Invalidation

Progress: [##########] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 48 (across v1.0-v1.6)
- Average duration: ~30 min
- Total execution time: ~24 hours

**Recent Trend (v1.6):**
- 7 plans across 4 phases in 5 days
- Trend: Stable

## Accumulated Context

### Decisions (stable -- see PROJECT.md for full list)

- Leaflet + OpenStreetMap chosen over Google Maps (free tiles, no API key for display)
- Lazy geocoding with sheet caching (avoid redundant API calls)
- Member location data is mixed/inconsistent -- geocoding must handle town-only, full address, and blank
- Geocoding always appends ", Puerto Rico" to queries (all SAC members are in PR)
- 200ms delay between geocoding API calls for rate limit compliance
- Missing API key returns null with warning (graceful degradation)
- Geo invalidation only in mergeRowData -- other Apps Script operations are safe by design
- Compare old vs new address values to avoid unnecessary geo invalidation on re-submissions

### Pending Todos

None.

### Blockers/Concerns

- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js cause build failures
- Member location data is mixed/inconsistent -- geocoding must handle town-only, full address, and blank
- Google Geocoding API requires API key and billing (confirm key exists or needs setup)

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 23-02-PLAN.md (Geo Column Invalidation)
Resume file: None
