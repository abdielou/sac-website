# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** v1.7 Members Map View — Phase 24 Map View & Side Panel

## Current Position

Phase: 24 of 25 (Map View & Side Panel)
Plan: 1 of 2 in current phase (COMPLETE)
Status: In Progress
Last activity: 2026-02-20 — Completed 24-01 Map View Toggle & Pins

Progress: [#####-----] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 49 (across v1.0-v1.7)
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

### Pending Todos

None.

### Blockers/Concerns

- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js cause build failures
- Member location data is mixed/inconsistent -- geocoding must handle town-only, full address, and blank
- Google Geocoding API requires API key and billing (confirm key exists or needs setup)

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 24-01-PLAN.md (Map View Toggle & Pins)
Resume file: None
