# Phase 31: Object Catalog & Storage - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Discovery session (.planning/discovery/observing-guides/observing-guides-notes.md)

<domain>
## Phase Boundary

This phase delivers the data foundation: a searchable deep-sky object catalog and an S3 guide storage layer. No UI — just the data and utilities that phases 32-34 build on.

</domain>

<decisions>
## Implementation Decisions

### Object Catalog
- Use OpenNGC CSV as primary data source (~13K objects, CC BY-SA 4.0 license)
- Fields needed: name, NGC/IC/Messier catalog IDs, RA/Dec (J2000), magnitude, angular size (major/minor axis), object type, constellation
- A build script or data file converts OpenNGC CSV into a searchable JSON catalog
- Spanish common names from Stellarium translation files (~200+ deep-sky objects)
- Common name mapping: merge OpenNGC `NGC_common_names.csv` with Stellarium `es.po` translations

### Object Data Shape (unified across all guide types)
- All objects share a single schema: name, catalogIds (NGC, IC, Messier), ra, dec, magnitude, angularSize, objectType, constellation, commonName, commonNameEs
- Guide-specific annotations (difficulty, equipment, location, notes, optimalTime) are NOT part of the catalog — they're per-guide-entry metadata added by the admin

### Guide Storage (S3)
- Guides stored as JSON in S3, same pattern as articles: `guides/{slug}.json` with `guides/index.json`
- Guide JSON includes: title, type (galaxies/objects), slug, status (draft/published), publishedAt, author, entries[]
- Each entry references a catalog object ID + guide-specific annotations (difficulty, equipment, location, optimalTime, notes)
- S3 utilities: createGuide, updateGuide, deleteGuide, getGuide, listGuides, publishGuide

### Claude's Discretion
- How to structure the catalog build script (standalone Node script vs build-time data generation)
- Whether to store the full catalog as a single JSON file or split by constellation/type
- Index structure for fast search (by name, catalog ID, object type)
- How to handle OpenNGC objects that have no common name
- Caching strategy for the catalog (static import vs API route)

</decisions>

<specifics>
## Specific Ideas

- OpenNGC repo: https://github.com/mattiaverga/OpenNGC — CSV + common names CSV
- Stellarium Spanish translations: `stellarium/po/stellarium-skycultures/es.po` and nebulae names
- Existing S3 article pattern in `lib/s3-articles.js` — follow same structure for guides
- SkyView thumbnail URLs: `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Position={ra},{dec}&Survey=DSS&Return=JPEG&Pixels=300`
- The catalog should be importable/searchable by the admin guide builder (Phase 32)

</specifics>

<deferred>
## Deferred Ideas

- SIMBAD TAP API fallback for objects not in OpenNGC — future enhancement (ENH-02)
- Visibility/altitude calculator using astronomy-engine — future enhancement (ENH-01)
- Aladin Lite embedded sky atlas — out of scope

</deferred>

---

*Phase: 31-object-catalog-storage*
*Context gathered: 2026-03-26 via discovery session*
