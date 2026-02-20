---
phase: 23-geocoding-pipeline
plan: 01
subsystem: api
tags: [geocoding, google-maps-api, google-sheets, geolocation]

requires:
  - phase: none
    provides: existing google-sheets.js with getMembers() and CLEAN sheet access
provides:
  - geocodeAddress() and geocodeMembers() in lib/geocoding.js
  - writeGeoData() in lib/google-sheets.js for persisting geo coordinates
  - POST /api/admin/members/geocode endpoint for triggering geocoding
  - geoLat/geoLng fields in getMembers() response
affects: [23-geocoding-pipeline plan 02, members-map-view UI]

tech-stack:
  added: [Google Geocoding API]
  patterns: [lazy geocoding with spreadsheet caching, rate-limited batch API calls]

key-files:
  created:
    - lib/geocoding.js
    - app/api/admin/members/geocode/route.js
  modified:
    - lib/google-sheets.js
    - .env.template

key-decisions:
  - "Geocoding always appends ', Puerto Rico' to queries since all SAC members are in PR"
  - "200ms delay between geocoding API calls for rate limit compliance"
  - "Missing API key logs warning and returns null (graceful degradation, no throws)"
  - "geo_lat/geo_lng columns created automatically in CLEAN sheet if missing"

patterns-established:
  - "Lazy geocoding: only geocode members with null geoLat AND null geoLng who have address data"
  - "Spreadsheet as geo cache: coordinates written back to sheet, read on subsequent loads"

requirements-completed: [GEO-01, GEO-02, GEO-03]

duration: 3min
completed: 2026-02-20
---

# Phase 23 Plan 01: Geocoding Pipeline Summary

**Google Geocoding API pipeline with lazy computation, spreadsheet caching, and batch write-back for member coordinates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T15:39:42Z
- **Completed:** 2026-02-20T15:42:26Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- getMembers() now returns geoLat/geoLng fields parsed from CLEAN sheet geo_lat/geo_lng columns
- writeGeoData() writes geocoded coordinates back to the spreadsheet with auto-column creation
- geocodeAddress() builds query from available address parts + Puerto Rico suffix, calls Google Geocoding API
- geocodeMembers() filters, geocodes with 200ms rate limiting, persists results via writeGeoData()
- POST /api/admin/members/geocode endpoint with auth triggers batch geocoding

## Task Commits

Each task was committed atomically:

1. **Task 1: Add geo fields to getMembers() and create writeGeoData()** - `bade7c9` (feat)
2. **Task 2: Create geocoding library and API endpoint** - `359d146` (feat)

## Files Created/Modified
- `lib/google-sheets.js` - Added geoLat/geoLng to getMembers() return, added writeGeoData() export
- `lib/geocoding.js` - New: geocodeAddress() and geocodeMembers() with Google Geocoding API integration
- `app/api/admin/members/geocode/route.js` - New: POST endpoint triggering batch geocoding with auth
- `.env.template` - Added GOOGLE_GEOCODING_API_KEY documentation

## Decisions Made
- Geocoding always appends ", Puerto Rico" since all SAC members are in PR (avoids ambiguous results)
- 200ms delay between API calls to respect Google rate limits
- Missing API key returns null with console warning (no crash, graceful degradation)
- geo_lat/geo_lng columns auto-created in CLEAN sheet if not present
- Coordinates stored as strings in the spreadsheet, parsed as floats on read

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

**External services require manual configuration:**
- **GOOGLE_GEOCODING_API_KEY** environment variable must be set
- Enable Geocoding API in Google Cloud Console (APIs & Services > Library > search "Geocoding API" > Enable)
- Create API key in Google Cloud Console (APIs & Services > Credentials > Create API Key), restrict to Geocoding API

## Next Phase Readiness
- Geocoding pipeline complete, ready for Plan 02 (map view UI integration)
- Members with coordinates will be displayed on the map; members without will be geocoded on demand via the API endpoint

---
*Phase: 23-geocoding-pipeline*
*Completed: 2026-02-20*
