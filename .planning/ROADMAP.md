# Roadmap: SAC Website

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-01-27)
- ✅ **v1.1 FB-YT Archive** — Phase 6 (shipped 2026-01-29)
- ✅ **v1.2 PayPal Payments** — Phase 7 (shipped 2026-01-30)
- ✅ **v1.3 Admin Dashboard** — Phases 8-12 (shipped 2026-02-05)
- ✅ **v1.4 Payment Classification & Apps Script** — Phases 13-16 (shipped 2026-02-10)
- ✅ **v1.5 Calendar-Year Membership Rules** — Phases 17-18 (shipped 2026-02-12)
- ✅ **v1.6 Article Manager** — Phases 19-22 (shipped 2026-02-17)
- ✅ **v1.7 Members Map View** — Phases 23-25 (shipped 2026-02-25)
- ✅ **v1.8 Member Profiles & ID Cards** — Phases 26-30 (shipped 2026-03-02)
- 🚧 **v1.9 Observing Guides** — Phases 31-34 (in progress)

## Phases

<details>
<summary>✅ v1.0 through v1.5 (Phases 1-18) — SHIPPED</summary>

See .planning/MILESTONES.md for details on shipped milestones.

</details>

<details>
<summary>✅ v1.6 Article Manager (Phases 19-22) — SHIPPED 2026-02-17</summary>

See .planning/milestones/v1.6-ROADMAP.md for full details.

</details>

<details>
<summary>✅ v1.7 Members Map View (Phases 23-25) — SHIPPED 2026-02-25</summary>

See .planning/milestones/v1.7-ROADMAP.md for full details.

</details>

<details>
<summary>✅ v1.8 Member Profiles & ID Cards (Phases 26-30) — SHIPPED 2026-03-02</summary>

- [x] Phase 26: Next.js 16 Migration (2/2 plans) — completed 2026-02-26
- [x] Phase 27: Member Authentication (2/2 plans) — completed 2026-02-26
- [x] Phase 28: Photo Storage & Member Profile (4/4 plans) — completed 2026-02-27
- [x] Phase 29: ID Card System (4/4 plans) — completed 2026-03-02
- [x] Phase 30: Bulk Generation & Notifications (2/2 plans) — completed 2026-02-28

See .planning/milestones/v1.8-ROADMAP.md for full details.

</details>

### 🚧 v1.9 Observing Guides (In Progress)

**Milestone Goal:** Bring SAC's astronomy observing guides to the website as interactive, filterable pages with admin management and branded PDF export.

- [x] **Phase 31: Object Catalog & Storage** - OpenNGC catalog with Spanish names and S3 guide storage layer (completed 2026-03-27)
- [x] **Phase 32: Admin Guide Builder** - Dashboard CRUD for creating, curating, and publishing guides (completed 2026-03-27)
- [x] **Phase 33: Public Guides Page** - Interactive `/guides` page with filtering, sorting, and edition browsing (completed 2026-03-27)
- [ ] **Phase 34: PDF Export** - Branded PDF download per guide using @react-pdf/renderer

## Phase Details

### Phase 31: Object Catalog & Storage
**Goal**: The system has a searchable deep-sky object catalog and an S3 storage layer ready for guide data
**Depends on**: Nothing (first phase of v1.9)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. A script or build step produces a local JSON catalog from OpenNGC CSV containing RA/Dec, magnitude, angular size, object type, and Messier/NGC/IC cross-references for all 13K objects
  2. Deep-sky objects with common names display their Spanish name from Stellarium translations
  3. Guide JSON can be written to and read from S3 with an index file, following the same pattern as articles/{slug}.json
**Plans:** 2/2 plans complete

Plans:
- [ ] 31-01-PLAN.md — OpenNGC catalog build script with Spanish names and search utilities
- [ ] 31-02-PLAN.md — S3 guide storage layer (CRUD following articles-s3 pattern)

### Phase 32: Admin Guide Builder
**Goal**: Admins can create, curate, and publish observing guides from the dashboard
**Depends on**: Phase 31
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Admin can search the object catalog by name, catalog ID, or object type and see matching results
  2. Admin can create a new guide with a free-form title, select its type (galaxies or objects), and add objects from search results
  3. Admin can annotate each object in a guide with difficulty, equipment needed, location suitability, optimal viewing time, and freeform notes
  4. Admin can reorder, remove, and edit objects within a guide, then save as draft or publish
  5. Admin can edit existing guides and toggle between published and unpublished states
**Plans:** 2/2 plans complete

Plans:
- [ ] 32-01-PLAN.md — API layer: guide business logic, permissions, catalog search and guide CRUD endpoints
- [ ] 32-02-PLAN.md — Admin UI: guide list page, editor with catalog search, annotations, reorder, draft/publish

### Phase 33: Public Guides Page
**Goal**: Users can browse interactive observing guides on the public website
**Depends on**: Phase 32
**Requirements**: PUB-01, PUB-02, PUB-03, PUB-04, PUB-06
**Success Criteria** (what must be TRUE):
  1. User sees a `/guides` page with two distinct sections: seasonal galaxies and monthly objects, each showing the most recent published guide
  2. User can filter objects within a guide by equipment type, difficulty level, and location suitability
  3. User can sort object lists by name, optimal viewing time, difficulty, or magnitude
  4. User can select past guide editions from a dropdown per section, and the list updates to show that edition's objects
  5. Each object in a guide displays a SkyView thumbnail image generated from its RA/Dec coordinates
**Plans:** 2/2 plans complete

Plans:
- [ ] 33-01-PLAN.md — Public API route for published guides with catalog data + nav link
- [ ] 33-02-PLAN.md — Interactive /guides page with sections, filtering, sorting, edition browsing, SkyView thumbnails

### Phase 34: PDF Export
**Goal**: Users can download branded PDF versions of observing guides
**Depends on**: Phase 33
**Requirements**: PUB-05
**Success Criteria** (what must be TRUE):
  1. User can click a download button on any guide section and receive a branded PDF with SAC design
  2. The PDF contains the guide title, edition info, and all objects with their annotations and thumbnails
**Plans**: TBD

Plans:
- [ ] 34-01: TBD

## Progress

**Execution Order:** 31 → 32 → 33 → 34

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5 | v1.0 | 15/15 | Complete | 2026-01-27 |
| 6 | v1.1 | 3/3 | Complete | 2026-01-29 |
| 7 | v1.2 | 2/2 | Complete | 2026-01-30 |
| 8-12 | v1.3 | 11/11 | Complete | 2026-02-05 |
| 13-16 | v1.4 | 7/7 | Complete | 2026-02-10 |
| 17-18 | v1.5 | 3/3 | Complete | 2026-02-12 |
| 19-22 | v1.6 | 7/7 | Complete | 2026-02-17 |
| 23-25 | v1.7 | 5/5 | Complete | 2026-02-25 |
| 26-30 | v1.8 | 14/14 | Complete | 2026-03-02 |
| 31. Catalog & Storage | 2/2 | Complete    | 2026-03-27 | - |
| 32. Admin Guide Builder | 2/2 | Complete    | 2026-03-27 | - |
| 33. Public Guides Page | 2/2 | Complete   | 2026-03-27 | - |
| 34. PDF Export | v1.9 | 0/? | Not started | - |
