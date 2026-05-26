# SAC Website

## What This Is

Website for Sociedad de Astronomia del Caribe (SAC) — a non-profit astronomy organization in Puerto Rico. Includes a public-facing site (blog, events, gallery, interactive observing guides) and an admin dashboard for membership management, payment tracking, workspace account generation, automated inbox scanning via Google Apps Script, article and guide management backed by AWS S3, and media hosting. Members sign in with their SAC Google accounts to view their profile, upload photos, and download printable ID cards.

## Core Value

Admins can accurately track membership status and payments so that no member falls through the cracks.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Next.js 15 App Router migration — v1.0
- ✓ Facebook/YouTube archive inbox processing — v1.1
- ✓ PayPal email parsing for payments — v1.2
- ✓ Google OAuth admin authentication — v1.3
- ✓ Google Sheets data layer with caching — v1.3
- ✓ Admin dashboard with members/payments lists — v1.3
- ✓ Payment classification (membership vs non-membership) — v1.4
- ✓ Apps Script web app for inbox scan & manual payments — v1.4
- ✓ Phone-based payment matching (most-recent-wins) — ad-hoc
- ✓ CSV export with status filters — ad-hoc
- ✓ Calendar-year membership expiration rules (H1/H2 coverage) — v1.5
- ✓ Jan-Feb grace period for renewals (expiring-soon status) — v1.5
- ✓ Workspace account generation from admin dashboard — v1.5
- ✓ S3-based article storage with JSON files + index — v1.6
- ✓ Migrate existing MDX posts and blog images to S3 — v1.6
- ✓ Markdown editor with syntax highlighting and real-time preview — v1.6
- ✓ Article CRUD (create, edit, delete, publish/unpublish) — v1.6
- ✓ Image upload to S3 from article editor — v1.6
- ✓ Blog rendering from S3 (index, posts, tags, RSS, SEO) — v1.6
- ✓ Grid/map view toggle on members tab — v1.7
- ✓ Leaflet + OpenStreetMap interactive map with member pins and popups — v1.7
- ✓ Side panel with member name list and "no location" indicator — v1.7
- ✓ Click-on-map circle filter with adjustable radius control — v1.7
- ✓ Lazy geocoding with Google Geocoding API and sheet caching — v1.7
- ✓ Apps Script geo column invalidation on address change — v1.7
- ✓ Next.js 16 migration with --webpack build mode — v1.8
- ✓ Member sign-in with @sociedadastronomia.com Google account — v1.8
- ✓ Member profile page (view status, edit contact/equipment, upload photo) — v1.8
- ✓ Profile photo stored in Google Drive, served via API proxy — v1.8
- ✓ Year-versioned ID card template (React PDF, CR80 dimensions, QR code) — v1.8
- ✓ Admin generates per-member PDF ID card — v1.8
- ✓ Admin bulk generates PDF ID cards for all active members with photos — v1.8
- ✓ Admin members list shows missing photo indicator with filter — v1.8
- ✓ Member previews ID card on profile page, downloads PDF if active — v1.8
- ✓ Apps Script sends profile setup nudge email at membership creation — v1.8
- ✓ Old mock /id page removed, redirects to /member/profile — v1.8
- ✓ Interactive observing guides on public `/guides` page — v1.9
- ✓ Two guide sections: seasonal galaxies + monthly objects — v1.9
- ✓ Filterable/sortable object lists (equipment, difficulty, location) — v1.9
- ✓ Edition dropdown to browse past guides — v1.9
- ✓ Admin CRUD for guide management (create, edit, publish) — v1.9
- ✓ Object catalog from OpenNGC + Stellarium Spanish names — v1.9
- ✓ Guide data stored as JSON in S3 — v1.9
- ✓ Admin member photo upload from dashboard — v1.9

### Active

<!-- Current scope. Building toward these. -->

(none — run `/gsd-new-milestone` to define next scope)

## Next Milestone Goals

Not yet defined. Run `/gsd-new-milestone` to start the next cycle (questioning → research → requirements → roadmap).

<details>
<summary>✅ v1.9 Observing Guides (Shipped 2026-05-26)</summary>

**Goal:** Interactive observing guides with admin management.

**Shipped features:**
- Public `/guides` page with seasonal galaxies and monthly objects sections
- Filterable/sortable interactive object lists with equipment, difficulty, and location filters
- Edition dropdown per guide section
- Admin guide builder: search object catalog, curate list, annotate, publish
- Object data from OpenNGC + Stellarium Spanish names + SkyView thumbnails
- JSON storage in S3 (same pattern as articles)
- Admin member photo upload from dashboard

See `.planning/milestones/v1.9-ROADMAP.md` for full details.

</details>

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Admin-editable ID card templates — developer-maintained, versioned by year
- Email sending from dashboard — admins export lists and compose externally
- Venmo/Zelle payment sources — low volume, manual entry sufficient
- Author management UI — data/authors/*.md files are low-volume, rarely changes
- Photo approval workflow — over-engineered for ~100 members; admins trust members
- Member-to-member directory — privacy concerns, low value for small org
- Branded PDF export for observing guides — dropped; interactive web page is sufficient

## Current State

Shipped v1.9. Full stack operational:
- Blog runs entirely from S3 (77 articles, 215 images, ~133 MB)
- Admin dashboard: membership tracking, payment classification, workspace account generation
- Article manager: CodeMirror editor, live MDX preview, image upload, component insert menu
- Calendar-year membership rules with H1/H2 coverage and Jan-Feb grace period
- Apps Script integration for inbox scanning, manual payment entry, workspace creation, and profile setup nudge emails
- Members map view with Leaflet/OpenStreetMap, lazy geocoding, side panel, and radius filtering
- Member portal: SAC Google login, profile view/edit, photo upload/crop (Drive-backed), ID card preview and PDF download
- Admin ID cards: per-member PDF generation, bulk PDF export, missing photo filter
- Observing guides: public `/guides` page, admin guide builder, OpenNGC catalog, S3 storage

Tech stack: Next.js 16 App Router, Google Sheets, Google Drive, Apps Script, TanStack Query, Tailwind CSS, AWS S3, CodeMirror, next-mdx-remote, Leaflet/react-leaflet, @react-pdf/renderer, Auth.js v5.

## Context

- Membership fee is $25
- Payments come from ATH Movil, PayPal, and manual entry
- Members matched by email (primary) and phone (fallback), most-recent-wins
- Member location data in spreadsheet is mixed/inconsistent (town, full address, or blank)
- `calculateMembershipStatus()` uses calendar-year rules with H1/H2 coverage and Jan-Feb grace period
- Dashboard, badges, filters, CSV exports all work with active/expiring-soon/expired/applied
- Workspace accounts created via Apps Script → Google Workspace Admin API
- Articles stored as JSON in S3 (articles/{slug}.json), index at articles/index.json
- Blog images in separate S3_IMAGES_BUCKET_NAME bucket
- Member photos stored in Google Drive shared folder (board-only access), file ID cached in spreadsheet
- ID card templates versioned by year in lib/id-card/, background images in public/id-cards/

## Constraints

- **Platform**: Next.js 16 App Router, Vercel Hobby tier
- **Data**: Google Sheets via service account (google-spreadsheet library)
- **Locale**: Spanish (es-PR) for user-facing text, English for technical/internal
- **Auth**: Google OAuth with domain restriction + email allowlist; members via @sociedadastronomia.com domain

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Calendar-year expiration (not rolling 12-month) | Matches how SAC actually manages memberships | ✓ Good — 16 TDD tests, production verified |
| H1/H2 split determines coverage year | Simple rule: first half covers current year, second half covers next year too | ✓ Good — clear mental model |
| Jan-Feb grace period | Members get 2 months to renew before showing as expired | ✓ Good — reduces false negatives |
| Grace period only applies to immediately prior year | Members expired 2+ years ago are just expired, not expiring-soon | ✓ Good — prevents old members appearing as recent |
| UTC date methods throughout | Timezone-independent membership calculation | ✓ Good — works regardless of server timezone |
| Admin-selected sacEmail bypasses availability check | Trusted admin selection from generated candidates | ✓ Good — simpler flow, admin responsibility |
| Client-side email generator mirrors Apps Script logic | Preview consistency with actual creation | ✓ Good — no mismatch possible |
| S3-only for article storage (not Postgres) | Already have AWS credentials, zero new infra, simplest possible | ✓ Good — zero new infra, fast reads |
| Migrate all blog content + images to S3 | Single source of truth, no hybrid file/S3 system | ✓ Good — 77 posts + 215 images migrated cleanly |
| next-mdx-remote for S3 content (not mdx-bundler) | Simpler serialization for dynamic content | ✓ Good — serialize/deserialize works well |
| MDXComponents split into 3 files (no 'use client' on map) | RSC MDXRemote cannot consume components with 'use client' | ✓ Good — clean server/client boundary |
| Native YouTube/Facebook iframes (not react-player) | Eliminated hundreds of console warnings | ✓ Good — cleaner dev experience |
| CodeMirror with dynamic import (ssr:false) | Avoids SSR hydration issues with browser-only APIs | ✓ Good — no hydration errors |
| Client-side MDXRemote for preview (not /rsc) | Editor is client component, can't use RSC MDXRemote | ✓ Good — works with debounced preview API |
| Leaflet + OpenStreetMap (not Google Maps) | Free tiles, no API key for map display, lightweight | ✓ Good — zero cost for map tiles |
| Lazy geocoding with sheet caching | Avoid redundant API calls, geocode only when needed | ✓ Good — geocode once per member, cached in spreadsheet |
| CDN for Leaflet CSS (not node_modules import) | Avoids webpack file-loader conflict with Next.js | ✓ Good — requires CSP allowlist for unpkg.com |
| Auto-geocode on map view load | Seamless UX, no manual trigger needed | ✓ Good — ref guard prevents re-triggers per session |
| Inline styles for map popup badges | Tailwind dark mode classes don't apply in Leaflet popups | ✓ Good — consistent visibility on white background |
| --webpack flag for Next.js 16 build | Opt out of Turbopack; Turbopack incompatible with some deps | ✓ Good — stable builds with webpack |
| serverExternalPackages for @react-pdf/renderer + qrcode | These libs require server-side node execution, not bundling | ✓ Good — PDF generation works reliably |
| Separate Drive JWT auth (drive scope) from Sheets auth | Different OAuth scopes; can't share a single token | ✓ Good — clean separation |
| getMemberByEmail reuses getMembers() cache | Avoids redundant sheet queries | ✓ Good — fast profile loads |
| Photo proxy returns binary with Cache-Control private | Serve Drive photos through Next.js to avoid exposing Drive URLs | ✓ Good — secure, cacheable |
| getUserMedia for camera capture | Better UX than capture="user" file input on desktop browsers | ✓ Good — works across devices |
| IdCardPreview uses HTML/Tailwind (not @react-pdf/renderer) | React-PDF can't render in browser; HTML preview is faithful | ✓ Good — instant preview, PDF only on download |
| QR placeholder in browser preview; actual QR only in PDF | qrcode library is server-side only | ✓ Good — clean separation |
| Member PDF download gated on active/expiring-soon status | Inactive members shouldn't have valid-looking cards | ✓ Good — consistent with business rules |
| Copied styles in BulkIdCardDocument (not imported) | react-pdf requires per-module StyleSheet.create() | ✓ Good — no style bleed between documents |
| Background image from current year for bulk generation | All cards in a batch should be visually consistent | ✓ Good — admin expectation met |
| Plain ASCII in nudge email body | Apps Script encoding issues with special chars | ✓ Good — reliable delivery |
| isMember from JWT, isAdmin from permissionChecker | Dual source: isMember is domain-based, isAdmin is allowlist | ✓ Good — intentional separation of concerns |
| OpenNGC + Stellarium for guide catalog | 13K objects with Spanish names; no external API dependency | ✓ Good — fast local search |
| Curated catalog subset for production | Full 13K JSON too large for Vercel bundles; 1,101 curated objects sufficient | ✓ Good — 294KB vs 3.6MB |
| Guide S3 storage mirrors articles pattern | Reuse existing bucket, credentials, and index conventions | ✓ Good — zero new infra |
| SkyView URL-based thumbnails | No API key; RA/Dec from catalog | ✓ Good — simple, reliable |
| Phase 35 PDF export dropped | Interactive web page covers use case; PDF added complexity | ✓ Good — scope trimmed at close |

---
*Last updated: 2026-05-26 after v1.9 milestone archived*
