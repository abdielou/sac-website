# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** v1.7 Members Map View — Phase 25 Radius Filtering

## Current Position

Phase: 25 of 25 (Radius Filtering)
Plan: 1 of 1 in current phase (COMPLETE)
Status: Phase Complete
Last activity: 2026-02-20 — Completed 25-01 Radius Filtering

Progress: [##########] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 51 (across v1.0-v1.7)
- Average duration: ~30 min
- Total execution time: ~24 hours

**Recent Trend (v1.6):**
- 7 plans across 4 phases in 5 days
- Trend: Stable

## Accumulated Context

### Decisions (stable -- see PROJECT.md for full list)

- CDN for Leaflet CSS instead of node_modules import (avoids webpack file-loader conflict)
- Pinned popup tracking uses member email as identifier
- Leaflet + OpenStreetMap chosen over Google Maps (free tiles, no API key for display)
- Lazy geocoding with sheet caching (avoid redundant API calls)
- Member location data is mixed/inconsistent -- geocoding must handle town-only, full address, and blank
- Geocoding always appends ", Puerto Rico" to queries (all SAC members are in PR)
- 200ms delay between geocoding API calls for rate limit compliance
- Missing API key returns null with warning (graceful degradation)
- Geo invalidation only in mergeRowData -- other Apps Script operations are safe by design
- Compare old vs new address values to avoid unnecessary geo invalidation on re-submissions
- Haversine distance helper at module level for radius filtering (no external lib needed)
- Circle color #3b82f6 matches admin UI blue theme
- Members without coordinates excluded from radius filter results
- Radius value persists when clearing circle (only center resets)

### Pending Todos

None.

### Blockers/Concerns

- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js cause build failures
- Member location data is mixed/inconsistent -- geocoding must handle town-only, full address, and blank
- Google Geocoding API requires API key and billing (confirm key exists or needs setup)

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 25-01-PLAN.md (Radius Filtering) — Phase 25 complete
Resume file: None
