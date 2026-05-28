# Phase 32: Admin Guide Builder - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Source:** Discovery session (.planning/discovery/observing-guides/observing-guides-notes.md)

<domain>
## Phase Boundary

This phase delivers the admin dashboard CRUD for creating, curating, and publishing observing guides. It builds on Phase 31's object catalog (`lib/catalog.js`) and S3 guide storage (`lib/guides-s3.js`).

</domain>

<decisions>
## Implementation Decisions

### Admin Flow (locked)
- Core flow: search object catalog → add objects to guide → adjust annotations → save → publish
- Single author (Astrophotography Lead) — admin should be simple for one domain expert
- Admin must provide dashboard CRUD conceptually like blog article management, but NOT tied to MDX
- Claude has design freedom for admin UX (D10)

### Guide Data Model (locked)
- Guide type (galaxies/objects) is metadata on the guide, not a data model distinction (D2)
- All objects share a single data shape (D1)
- Guide title/period is free-form text — "Marzo 2026" or "Primavera 2026" (D12)
- Guide-specific annotations per object: difficulty, equipment, location suitability, optimal viewing time, notes
- Annotations are NOT part of the catalog — they're per-guide-entry metadata added by the admin

### Guide JSON Shape (from 31-CONTEXT.md)
- Stored at `guides/{slug}.json` with `guides/index.json`
- Guide JSON: { title, type, slug, status (draft/published), publishedAt, updatedAt, author, entries[] }
- Each entry: { objectId, difficulty, equipment, location, optimalTime, notes }
- Difficulty values: fácil, intermedio, retante
- Equipment values: tel. inteligente, equipo pequeño, telescopio grande, tel. tradicional, tel. mediano, tel. med-grande, tel. grande
- Location values: ciudad, suburbios, oscuro

### Object Catalog (from Phase 31, available)
- `lib/catalog.js` exports: searchCatalog(query, options), getObjectById(id), getCatalogStats()
- `data/catalog/openngc.json` — 13,962 objects
- `data/catalog/spanish-names.json` — 1,272 Spanish translations
- Search supports: name, catalog ID (NGC/IC/Messier), object type

### Existing Admin Patterns
- Admin routes at `app/api/admin/*/route.js`
- Auth via relative import from `../../../../auth` or similar
- Spanish error messages, technical details in English
- Cache invalidation via `invalidateCache()` from `lib/cache.js` after mutations
- TanStack Query for client-side data fetching
- Admin dashboard with collapsible sidebar, dark mode, Tailwind CSS
- Article manager pattern: list page with filters → new/edit form → publish/draft toggle

### Claude's Discretion
- Admin page layout and component structure
- How to present search results (autocomplete vs search panel)
- Guide list page design (table vs cards)
- Guide editor layout (sidebar catalog search + main editor area, or other)
- How to handle reordering (drag-and-drop vs up/down buttons)
- Slug generation from title
- Whether to use optimistic updates or refetch after mutations

</decisions>

<specifics>
## Specific Ideas

- Follow the article manager pattern from v1.6 for consistency
- Admin pages likely at: `/admin/guides` (list), `/admin/guides/new` (create), `/admin/guides/[slug]/edit` (edit)
- API routes: `/api/admin/guides` (list/create), `/api/admin/guides/[slug]` (get/update/delete)
- The equipment/difficulty/location values come from the PDF reference guides
- Consider a split-pane editor: catalog search on left, guide entries on right

</specifics>

<deferred>
## Deferred Ideas

- Public-facing guide display (Phase 33)
- PDF export (Phase 34)
- SkyView thumbnails in admin (could add later, not essential for curation)

</deferred>

---

*Phase: 32-admin-guide-builder*
*Context gathered: 2026-03-27 via discovery session*
