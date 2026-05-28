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
- ✅ **v1.9 Observing Guides** — Phases 31-34 (shipped 2026-05-26)
- 🚧 **v1.10 Family Member IDs** — Phases 35-38 (in progress)

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

<details>
<summary>✅ v1.9 Observing Guides (Phases 31-34) — SHIPPED 2026-05-26</summary>

- [x] Phase 31: Object Catalog & Storage (2/2 plans) — completed 2026-03-27
- [x] Phase 32: Admin Guide Builder (2/2 plans) — completed 2026-03-27
- [x] Phase 33: Public Guides Page (2/2 plans) — completed 2026-03-27
- [x] Phase 34: Admin Member Photo Upload (1/1 plans) — completed 2026-05-20

See .planning/milestones/v1.9-ROADMAP.md for full details.

</details>

### ✅ v1.10 Family Member IDs (Complete)

**Milestone Goal:** Members and admins can manage family member photos and download Family Member ID cards linked to the primary member's membership.

- [x] **Phase 35: Family Data Layer** - Sheet columns, name parsing, and photo ID storage
- [x] **Phase 36: Family ID Card Generation** - Template, QR to primary member, PDF/preview APIs
- [x] **Phase 37: Admin Family Management** - Edit names and manage photos via Member Actions
- [x] **Phase 38: Member Profile Family UI** - Read-only names, photo upload, preview/download

## Phase Details

### Phase 35: Family Data Layer
**Goal**: The system reads and writes family member names and photo references from Google Sheets
**Depends on**: Nothing (first phase of v1.10)
**Requirements**: FAM-01, FAM-02, FAM-03
**Success Criteria** (what must be TRUE):
  1. CLEAN sheet has `familyMembers` column (semicolon-separated names) auto-created if missing
  2. CLEAN sheet has `familyMemberPhotos` column (JSON name→photoFileId map) auto-created if missing
  3. `getMembers()` returns parsed `familyMembers` array and `familyMemberPhotos` object on each member
  4. Admin API can update `familyMembers` names list for a member row
  5. Photo upload API can store a Drive file ID keyed by family member name in `familyMemberPhotos`
**Plans:** 2 plans

Plans:
- [x] 35-01-PLAN.md — Family parse utilities + Google Sheets columns and update functions
- [x] 35-02-PLAN.md — uploadFamilyPhoto + admin APIs for names and family photos

### Phase 36: Family ID Card Generation
**Goal**: The system generates Family Member ID cards that look like member IDs but verify the sponsoring member
**Depends on**: Phase 35
**Requirements**: FAM-04, FAM-05, FAM-06, FAM-07, FAM-08, FAM-09, FAM-10
**Success Criteria** (what must be TRUE):
  1. Family ID card PDF shows family member name, photo, "Familiar" designation, and primary member vigencia
  2. QR code on family card uses the primary member's verify token (same URL as member ID)
  3. Browser preview component renders family card faithfully before PDF download
  4. Member API returns family member PDF when membership is active or expiring-soon
  5. Admin API returns family member PDF for any member with a photo on file
**Plans:** 2 plans

Plans:
- [x] 36-01-PLAN.md — Shared IdCard extension + generateFamilyIdCardPdf (FAM-04, FAM-05, FAM-06)
- [x] 36-02-PLAN.md — FamilyIdCardPreview, photo proxy, admin/member PDF + preview APIs (FAM-07–FAM-10)

### Phase 37: Admin Family Management
**Goal**: Admins can manage family member names and photos from the members list actions menu
**Depends on**: Phase 36
**Requirements**: FAM-11, FAM-12, FAM-13
**Success Criteria** (what must be TRUE):
  1. Admin can open "Editar familiares" from Member Actions and save a semicolon-separated names list
  2. Admin can upload or re-crop a photo for each family member from Member Actions
  3. Admin can preview and download a family member ID card from Member Actions
  4. Members grid or action UI indicates which family members are missing photos
**Plans:** 2 plans

Plans:
- [x] 37-01-PLAN.md — Family management modal, names editor, photo status indicators (FAM-11, FAM-13)
- [x] 37-02-PLAN.md — Family photo upload + ID preview/download modals (FAM-12)

### Phase 38: Member Profile Family UI
**Goal**: Members can view family names and manage family photos from their profile
**Depends on**: Phase 37
**Requirements**: FAM-14, FAM-15
**Success Criteria** (what must be TRUE):
  1. Member profile shows family member names as read-only list (no edit control)
  2. Member can upload or re-crop a photo for each family member from profile
  3. Member can preview and download family member ID cards when membership is active or expiring-soon
**Plans**: 2 plans

Plans:
- [x] 38-01-PLAN.md — FamilySection read-only names + photo status in ProfileView (FAM-14)
- [x] 38-02-PLAN.md — Member family photo API + upload/preview/download modals (FAM-15)

## Progress

**Execution Order:** 35 → 36 → 37 → 38

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
| 31-34 | v1.9 | 7/7 | Complete | 2026-05-26 |
| 35. Family Data Layer | v1.10 | 2/2 | Complete | 2026-05-27 |
| 36. Family ID Card Generation | v1.10 | 2/2 | Complete | 2026-05-27 |
| 37. Admin Family Management | v1.10 | 2/2 | Complete | 2026-05-27 |
| 38. Member Profile Family UI | v1.10 | 2/2 | Complete | 2026-05-27 |
