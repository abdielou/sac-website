# Phase 33: Public Guides Page - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Source:** Discovery session (.planning/discovery/observing-guides/observing-guides-notes.md)

<domain>
## Phase Boundary

This phase delivers the public-facing `/guides` page. It reads published guide data from S3 (via Phase 31/32 infrastructure) and renders two interactive sections with filtering, sorting, edition browsing, and SkyView thumbnails. No admin functionality — purely public read-only display.

</domain>

<decisions>
## Implementation Decisions

### Page Structure (locked)
- Single `/guides` page with two stacked sections: "Galaxias de la temporada" then "Objetos del mes" (D6)
- Each section has its own filterable/sortable object list
- New top-level nav item "Guides" in English (D4, D5)
- Navigation labels are English; page content/copy is Spanish (D5)

### Edition Browsing (locked)
- Each section has a dropdown to select past editions, defaults to most recent published (D7, D13)
- PDF download button sits next to the dropdown (D7) — but PDF generation is Phase 34, so just show placeholder/disabled button for now

### Interactive Features (locked)
- Filter dimensions: equipment type (tel. inteligente, equipo pequeño, telescopio grande), difficulty (fácil, intermedio, retante), location suitability (ciudad, suburbios, oscuro) (D9)
- Sorting by name, optimal viewing time, difficulty, or magnitude
- Filtering and sorting are the core interactive advantage over static PDFs (F4)

### Object Display (locked)
- Claude has design freedom, using both PDFs as reference (D8)
- Likely card-based layout inspired by the galaxias PDF (tags for equipment/location, key data visible at a glance) that works on mobile
- Each object displays a SkyView thumbnail from its RA/Dec coordinates

### SkyView Thumbnails
- URL pattern: `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Position={ra},{dec}&Survey=DSS&Return=JPEG&Pixels=300`
- Free, no API key, URL-based — can use as `<img>` src directly
- Consider smaller pixel size for thumbnails (e.g., 150px) to reduce load time

### Data Sources (from Phase 31/32)
- `lib/guides-s3.js` — getGuideJSON(slug), getGuideIndex() for fetching published guides
- `lib/catalog.js` — getObjectById(id) for resolving catalog data per guide entry
- Guide JSON shape: { title, type, slug, status, publishedAt, author, entries[] }
- Entry shape: { objectId, difficulty, equipment, location, optimalTime, notes }
- Catalog object: { id, name, commonName, commonNameEs, ra, dec, magnitude, angularSize, objectType, constellation, messier, ngc, ic }

### Claude's Discretion
- Card vs row layout for objects
- Filter UI: pills/chips, dropdown selectors, sidebar filters, or inline toggles
- Sort control placement and style
- Color coding for difficulty/equipment/location tags
- How to handle empty state (no published guides of a type)
- Whether to use server components or client components for the page
- Caching strategy for guide data (ISR, on-demand, etc.)

</decisions>

<specifics>
## Specific Ideas

- Reference PDFs: `Guia de Astrofotografia - Febrero.pdf` (tabular, by size), `guia_galaxias_temporada_PR_A3_FINAL_v7.pdf` (cards, by time, with tags)
- The galaxias PDF visual style is a good reference: colored tags for equipment/location, clean cards with key data
- Public route: `app/guides/page.js`
- API route for public guide data: `app/api/guides/route.js` (no auth required, only returns published guides)
- Consider `headerNavLinks.js` for adding "Guides" to site navigation

</specifics>

<deferred>
## Deferred Ideas

- PDF download functionality (Phase 34)
- Visibility/altitude calculations (future enhancement)
- SIMBAD API fallback (future enhancement)

</deferred>

---

*Phase: 33-public-guides-page*
*Context gathered: 2026-03-27 via discovery session*
