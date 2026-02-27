# Requirements: SAC Website

**Defined:** 2026-02-26
**Core Value:** Admins can accurately track membership status and payments so that no member falls through the cracks.

## v1.8 Requirements

Requirements for Member Profiles & ID Cards milestone. Each maps to roadmap phases.

### Migration

- [x] **MIG-01**: Next.js upgraded from 15 to 16 with all breaking changes resolved
- [x] **MIG-02**: middleware.js renamed to proxy.js with Auth.js integration working
- [x] **MIG-03**: All async params/cookies/headers patterns updated for Next.js 16

### Member Authentication

- [x] **AUTH-01**: Member can sign in with their @sociedadastronomia.com Google account
- [x] **AUTH-02**: Member session includes isMember flag and is scoped to their own data only
- [x] **AUTH-03**: Admin routes remain restricted to admin-only (existing behavior preserved)

### Member Profile

- [x] **PROF-01**: Member can view their profile showing name, email, status, expiration, and member-since date
- [ ] **PROF-02**: Member can edit their contact info (phone, town, postal address, zipcode)
- [ ] **PROF-03**: Member can edit their equipment info (telescope model, other equipment)
- [ ] **PROF-04**: Member can upload a profile photo with client-side crop to square
- [ ] **PROF-05**: Member can take a photo using their device camera and crop it
- [ ] **PROF-06**: Member can preview their ID card on their profile page

### Photo Storage

- [ ] **PHOTO-01**: Profile photos stored in Google Drive folder with board-only access
- [ ] **PHOTO-02**: Photos served to authenticated members only via API route proxy
- [ ] **PHOTO-03**: Photo file ID tracked in spreadsheet (photoFileId column in CLEAN sheet)

### ID Cards

- [ ] **ID-01**: Year-versioned ID card React template with swappable background image and year text
- [ ] **ID-02**: ID card includes QR code linking to membership verification
- [ ] **ID-03**: Admin can generate a printable PDF ID card for a single member
- [ ] **ID-04**: Admin can bulk generate printable PDF ID cards for all active members with photos
- [ ] **ID-05**: Admin members list shows "missing photo" indicator and is filterable by it

### Notifications

- [ ] **NOTIF-01**: Apps Script sends profile setup email at membership creation nudging photo upload

### Cleanup

- [ ] **CLEAN-01**: Existing mock /id page removed and replaced with profile-based ID experience

## Future Requirements

- Member clustering and heat maps on map view
- Status filtering on map (show only active/expired)
- Expiration reminder emails to members
- ID card barcode/NFC for event check-in

## Out of Scope

| Feature | Reason |
|---------|--------|
| Admin-editable ID card templates | Developer-maintained, versioned by year in code |
| Email sending from dashboard | Admins export lists and compose externally |
| Photo approval workflow | Over-engineered for ~100 members; admins trust members |
| Member-to-member directory | Privacy concerns, low value for small org |
| Multiple photos per member | Single profile photo sufficient for ID cards |
| PDF card designer/drag-and-drop | Templates are code-managed, no runtime design tool needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIG-01 | Phase 26 | Complete |
| MIG-02 | Phase 26 | Complete |
| MIG-03 | Phase 26 | Complete |
| AUTH-01 | Phase 27 | Complete |
| AUTH-02 | Phase 27 | Complete |
| AUTH-03 | Phase 27 | Complete |
| PROF-01 | Phase 28 | Complete |
| PROF-02 | Phase 28 | Pending |
| PROF-03 | Phase 28 | Pending |
| PROF-04 | Phase 28 | Pending |
| PROF-05 | Phase 28 | Pending |
| PROF-06 | Phase 29 | Pending |
| PHOTO-01 | Phase 28 | Pending |
| PHOTO-02 | Phase 28 | Pending |
| PHOTO-03 | Phase 28 | Pending |
| ID-01 | Phase 29 | Pending |
| ID-02 | Phase 29 | Pending |
| ID-03 | Phase 29 | Pending |
| ID-04 | Phase 30 | Pending |
| ID-05 | Phase 29 | Pending |
| NOTIF-01 | Phase 30 | Pending |
| CLEAN-01 | Phase 29 | Pending |

**Coverage:**
- v1.8 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after roadmap creation*
