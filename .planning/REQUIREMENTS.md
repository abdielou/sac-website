# Requirements: SAC Website

**Defined:** 2026-03-26
**Core Value:** Admins can accurately track membership status and payments so that no member falls through the cracks.

## v1.9 Requirements

Requirements for Observing Guides milestone. Each maps to roadmap phases.

### Data Layer

- [x] **DATA-01**: System provides a local object catalog from OpenNGC with RA/Dec, magnitude, angular size, object type, and Messier/NGC/IC cross-references
- [x] **DATA-02**: System maps deep-sky object common names to Spanish using Stellarium translations
- [x] **DATA-03**: Guides are stored as JSON in S3 with an index file, following the article storage pattern

### Public Experience

- [ ] **PUB-01**: User can view a `/guides` page with two sections: seasonal galaxies and monthly objects
- [ ] **PUB-02**: User can filter objects by equipment type, difficulty, and location suitability
- [ ] **PUB-03**: User can sort object lists by name, optimal time, difficulty, or magnitude
- [ ] **PUB-04**: User can select past guide editions via dropdown per section, defaulting to most recent
- [ ] **PUB-05**: User can download a guide as a branded PDF with SAC design
- [ ] **PUB-06**: Each object displays a SkyView thumbnail image auto-generated from its coordinates

### Admin Guide Builder

- [x] **ADMIN-01**: Admin can search the object catalog by name, catalog ID, or object type
- [x] **ADMIN-02**: Admin can create a new guide with free-form title, type (galaxies/objects), and add objects from the catalog
- [ ] **ADMIN-03**: Admin can annotate each object in a guide with difficulty, equipment, location suitability, optimal viewing time, and notes
- [ ] **ADMIN-04**: Admin can reorder, remove, and edit objects within a guide
- [x] **ADMIN-05**: Admin can save guide as draft or publish to public
- [x] **ADMIN-06**: Admin can edit and unpublish existing guides

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: Visibility/altitude calculator using astronomy-engine for PR coordinates
- **ENH-02**: SIMBAD TAP API fallback for objects not in OpenNGC
- **ENH-03**: Additional guide types beyond galaxies and monthly objects
- Member clustering and heat maps on map view
- Status filtering on map (show only active/expired)
- Expiration reminder emails to members
- ID card barcode/NFC for event check-in

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time sky visibility calculations | Adds complexity; static guides sufficient for v1.9 |
| User-submitted object suggestions | Single author model; admin controls curation |
| Multi-language guide support | Site is es-PR only; Spanish names cover the need |
| Aladin Lite embedded sky atlas | Nice-to-have but not core to guide functionality |
| Admin-editable ID card templates | Developer-maintained, versioned by year in code |
| Email sending from dashboard | Admins export lists and compose externally |
| Photo approval workflow | Over-engineered for ~100 members; admins trust members |
| Member-to-member directory | Privacy concerns, low value for small org |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 31 | Complete |
| DATA-02 | Phase 31 | Complete |
| DATA-03 | Phase 31 | Complete |
| PUB-01 | Phase 33 | Pending |
| PUB-02 | Phase 33 | Pending |
| PUB-03 | Phase 33 | Pending |
| PUB-04 | Phase 33 | Pending |
| PUB-05 | Phase 34 | Pending |
| PUB-06 | Phase 33 | Pending |
| ADMIN-01 | Phase 32 | Complete |
| ADMIN-02 | Phase 32 | Complete |
| ADMIN-03 | Phase 32 | Pending |
| ADMIN-04 | Phase 32 | Pending |
| ADMIN-05 | Phase 32 | Complete |
| ADMIN-06 | Phase 32 | Complete |

**Coverage:**
- v1.9 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation*
