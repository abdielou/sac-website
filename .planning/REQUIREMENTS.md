# Requirements: SAC Website

**Defined:** 2026-02-20
**Core Value:** Admins can accurately track membership status and payments so that no member falls through the cracks.

## v1.7 Requirements

Requirements for Members Map View milestone. Each maps to roadmap phases.

### UI Navigation

- [ ] **UI-01**: Admin can toggle between grid view and map view on the members tab
- [ ] **UI-02**: View preference persists across page navigation

### Map Display

- [ ] **MAP-01**: Admin can see an interactive Leaflet/OpenStreetMap map covering 80% of viewport width
- [ ] **MAP-02**: Geocoded members appear as pins on the map
- [ ] **MAP-03**: Hovering a pin shows a popup with member info; moving away dismisses it
- [ ] **MAP-04**: Clicking a pin keeps the popup open until explicitly closed

### Side Panel

- [ ] **PANEL-01**: 20% width side panel shows a scrollable list of member names
- [ ] **PANEL-02**: Members without location data appear in the list with a "no location" indicator (no map pin)

### Radius Filtering

- [ ] **RAD-01**: Clicking on the map places a circle with 5km default radius
- [ ] **RAD-02**: Side panel list filters to show only members within the circle
- [ ] **RAD-03**: Radius control at the top of the side panel adjusts the circle size

### Geocoding (App-Driven)

- [x] **GEO-01**: On map load, read lat/lng from spreadsheet for each member
- [x] **GEO-02**: If lat/lng missing, call Google Geocoding API using available address data
- [x] **GEO-03**: Write resolved lat/lng back to spreadsheet in new geo columns

### Geocoding (Apps Script)

- [x] **GEO-04**: When address columns change via Apps Script, wipe geo columns to trigger re-geocode
- [x] **GEO-05**: Existing Apps Script operations (scan, update, manual payment) do not wipe geo columns

## Future Requirements

- Member clustering at high zoom levels for large member counts
- Heat map overlay showing member density
- Export map view as image/PDF
- Filter map by membership status (active/expired)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Driving directions between members | Not relevant to membership management |
| Member self-service location update | No self-service portal exists |
| Multiple map providers | Leaflet + OSM is sufficient |
| Offline map support | Admin dashboard requires network access |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 24 | Pending |
| UI-02 | Phase 24 | Pending |
| MAP-01 | Phase 24 | Pending |
| MAP-02 | Phase 24 | Pending |
| MAP-03 | Phase 24 | Pending |
| MAP-04 | Phase 24 | Pending |
| PANEL-01 | Phase 24 | Pending |
| PANEL-02 | Phase 24 | Pending |
| RAD-01 | Phase 25 | Pending |
| RAD-02 | Phase 25 | Pending |
| RAD-03 | Phase 25 | Pending |
| GEO-01 | Phase 23 | Complete |
| GEO-02 | Phase 23 | Complete |
| GEO-03 | Phase 23 | Complete |
| GEO-04 | Phase 23 | Complete |
| GEO-05 | Phase 23 | Complete |

**Coverage:**
- v1.7 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after roadmap creation*
