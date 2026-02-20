# Roadmap: SAC Website

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-01-27)
- ✅ **v1.1 FB-YT Archive** — Phase 6 (shipped 2026-01-29)
- ✅ **v1.2 PayPal Payments** — Phase 7 (shipped 2026-01-30)
- ✅ **v1.3 Admin Dashboard** — Phases 8-12 (shipped 2026-02-05)
- ✅ **v1.4 Payment Classification & Apps Script** — Phases 13-16 (shipped 2026-02-10)
- ✅ **v1.5 Calendar-Year Membership Rules** — Phases 17-18 (shipped 2026-02-12)
- ✅ **v1.6 Article Manager** — Phases 19-22 (shipped 2026-02-17)
- 🚧 **v1.7 Members Map View** — Phases 23-25 (in progress)

## Phases

<details>
<summary>✅ v1.0 through v1.5 (Phases 1-18) — SHIPPED</summary>

See .planning/MILESTONES.md for details on shipped milestones.

</details>

<details>
<summary>✅ v1.6 Article Manager (Phases 19-22) — SHIPPED 2026-02-17</summary>

- [x] Phase 19: S3 Article Data Layer (1/1 plan) — completed 2026-02-12
- [x] Phase 20: Blog Rendering from S3 (2/2 plans) — completed 2026-02-12
- [x] Phase 21: Content Migration (2/2 plans) — completed 2026-02-17
- [x] Phase 22: Article Manager (2/2 plans) — completed 2026-02-17

See .planning/milestones/v1.6-ROADMAP.md for full details.

</details>

### 🚧 v1.7 Members Map View (In Progress)

**Milestone Goal:** Admins can visualize member locations on an interactive map with geocoding and radius-based filtering.

- [x] **Phase 23: Geocoding Pipeline** - Lazy geocoding with sheet caching and Apps Script geo column protection (completed 2026-02-20)
- [ ] **Phase 24: Map View & Side Panel** - Interactive map with member pins, popups, side panel, and view toggle
- [ ] **Phase 25: Radius Filtering** - Click-on-map circle filter with adjustable radius

## Phase Details

### Phase 23: Geocoding Pipeline
**Goal**: Member location data is reliably geocoded and cached in the spreadsheet
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: GEO-01, GEO-02, GEO-03, GEO-04, GEO-05
**Success Criteria** (what must be TRUE):
  1. When the map view loads, members with existing lat/lng in the spreadsheet are returned with coordinates
  2. Members missing lat/lng are geocoded via Google Geocoding API and the resolved coordinates are written back to the spreadsheet
  3. When a member's address changes via Apps Script (scan, manual update), the geo columns are wiped so the next map load triggers re-geocoding
  4. Existing Apps Script operations (inbox scan, manual payment, workspace account) do not accidentally wipe geo columns
**Plans**: 2 plans

Plans:
- [ ] 23-01-PLAN.md — App-side geocoding: geo fields in getMembers, writeGeoData, geocoding library, POST endpoint
- [ ] 23-02-PLAN.md — Apps Script geo column invalidation in mergeRowData on address change

### Phase 24: Map View & Side Panel
**Goal**: Admins can toggle to a map view showing member locations with an interactive side panel
**Depends on**: Phase 23
**Requirements**: UI-01, UI-02, MAP-01, MAP-02, MAP-03, MAP-04, PANEL-01, PANEL-02
**Success Criteria** (what must be TRUE):
  1. Admin can switch between the existing grid view and a new map view on the members tab, and the preference persists across navigation
  2. The map view shows a Leaflet/OpenStreetMap map (80% width) with pins for all geocoded members
  3. Hovering a pin shows a popup with member info that dismisses on mouse-out; clicking a pin keeps the popup open until explicitly closed
  4. A side panel (20% width) lists all members with a scrollable name list, showing a "no location" indicator for members without coordinates
**Plans**: 2 plans

Plans:
- [ ] 24-01-PLAN.md — View toggle, Leaflet map with member pins and hover/click popups
- [ ] 24-02-PLAN.md — Side panel with scrollable member list and no-location indicators

### Phase 25: Radius Filtering
**Goal**: Admins can click anywhere on the map to filter members within a configurable radius
**Depends on**: Phase 24
**Requirements**: RAD-01, RAD-02, RAD-03
**Success Criteria** (what must be TRUE):
  1. Clicking on the map places a visible circle with a 5km default radius
  2. The side panel list filters to show only members whose pins fall within the circle
  3. A radius control at the top of the side panel adjusts the circle size and the filtered list updates in real time
**Plans**: TBD

Plans:
- [ ] 25-01: Circle placement, radius control, and filtered member list

## Progress

**Execution Order:**
Phases execute in numeric order: 23 → 24 → 25

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5 | v1.0 | 15/15 | Complete | 2026-01-27 |
| 6 | v1.1 | 3/3 | Complete | 2026-01-29 |
| 7 | v1.2 | 2/2 | Complete | 2026-01-30 |
| 8-12 | v1.3 | 11/11 | Complete | 2026-02-05 |
| 13-16 | v1.4 | 7/7 | Complete | 2026-02-10 |
| 17-18 | v1.5 | 3/3 | Complete | 2026-02-12 |
| 19-22 | v1.6 | 7/7 | Complete | 2026-02-17 |
| 23. Geocoding Pipeline | 2/2 | Complete    | 2026-02-20 | - |
| 24. Map View & Side Panel | 1/2 | In Progress|  | - |
| 25. Radius Filtering | v1.7 | 0/1 | Not started | - |
