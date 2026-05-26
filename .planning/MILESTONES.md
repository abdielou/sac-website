# Project Milestones: SAC Website

## v1.9 Observing Guides (Shipped: 2026-05-26)

**Delivered:** Interactive observing guides on the public website with admin CRUD, OpenNGC catalog with Spanish names, S3 storage, and admin member photo upload from the dashboard.

**Phases completed:** 31-34 (4 phases, 7 plans)

**Key accomplishments:**

- OpenNGC catalog build script with Stellarium Spanish names and searchable utilities
- S3 guide storage layer following the articles pattern (`guides/{slug}.json` + index)
- Admin guide builder: catalog search, annotations, reorder, draft/publish
- Public `/guides` page with seasonal galaxies and monthly objects sections
- Filterable/sortable object lists with SkyView thumbnails and edition dropdown
- Admin member photo upload from dashboard (file-only, crop, Drive + Sheets update)
- Curated production catalog (1,101 objects) with supplementary famous-object entries

**Known gaps at close:**

- Phase 35 (PDF Export) dropped — PUB-05 deferred to future requirements
- Known deferred items at close: 2 pending todos (see STATE.md Deferred Items)

**Stats:**

- 35 files changed, +5,309 / -60 lines (phases 31-33 core)
- 4 phases, 7 plans
- 55 days from start to ship (2026-03-26 → 2026-05-20)

**Git range:** `a6fc181` → `e55c91d` (guides), `b571bf8` (admin photo upload)

**What's next:** Run `/gsd-new-milestone` to define v2.0 scope

---

## v1.4 Payment Classification & Apps Script Triggers (Shipped: 2026-02-10)

**Delivered:** Payment classification with three-state toggling, Apps Script web app integration for inbox scanning and manual payments, and dashboard trigger UI with kebab menus and modal forms.

**Phases completed:** 13-16 (7 plans total)

**Key accomplishments:**

- Payment classification data layer with explicit override + $25 heuristic fallback
- Three-state classification toggle (membership/non-membership/clear) with optimistic updates
- Apps Script doPost web app with scan and manual_payment actions, LockService concurrency
- Next.js proxy layer with user OAuth token auth (replaced service account for org-restricted Apps Script)
- ScanCard on dashboard with 409 auto-retry and 5-state UI
- MemberActions kebab menu + ManualPaymentModal for GIFT ($0) and MANUAL ($25) payments
- Admin note prepending and datetime tracking on manual payments

**Stats:**

- 23 files created/modified
- +1,792 / -236 lines
- 4 phases, 7 plans
- 5 days from start to ship (2026-02-05 → 2026-02-10)

**Git range:** `47d8f7f` → `08d8ba5`

**What's next:** Member lookup, additional admin features, or other SAC improvements

---

## v1.3 Admin Dashboard (Shipped: 2026-02-05)

**Delivered:** Authenticated admin dashboard for visualizing membership and payment data from Google Sheets with real-time filtering and search.

**Phases completed:** 8-12 (11 plans total, Phases 6-7 deferred)

**Key accomplishments:**

- Google OAuth authentication with domain restriction + email allowlist (Auth.js v5)
- Google Sheets data layer with service account JWT auth and 5-min server-side caching
- Dashboard layout with collapsible sidebar, responsive design, dark mode
- Stats cards (Total Members, Active, Expiring Soon) linking to pre-filtered views
- Members list with status badges, search, filtering, and pagination
- Payments list with source badges, search, filtering, and pagination
- PaymentTooltip with viewport-aware portal positioning
- Global refresh button clearing server cache and refetching all queries

**Stats:**

- 37 files created/modified
- +2,505 / -565 lines
- 5 phases, 11 plans
- 4 days from start to ship (2026-02-02 → 2026-02-05)

**Git range:** `82d642d` → `64dd904`

**Deferred:** Apps Script integration (FUNC-01, P2), Member lookup (FUNC-02, P3)

**What's next:** Apps Script triggers, member lookup, or other SAC improvements

---

## v1.2 PayPal Payment Support (Shipped: 2026-01-30)

**Delivered:** PayPal email parsing in membership payment scanner — automatic capture alongside ATH Movil.

**Phases completed:** 7 (2 plans total)

**Key accomplishments:**

- Created extractPayPalPaymentData() function parsing PayPal "Payment received" emails
- Added detectPaymentService() routing for multi-source payment processing
- Integrated PayPal scanning into handleNewMemberships scheduled job
- Added X-Original-Sender header validation to prevent email spoofing attacks
- PayPal payments flow through existing member matching (email-based)

**Stats:**

- 1 file modified (appsscript/CreateUser.js)
- +153 / -5 lines
- 1 phase, 2 plans, 4 tasks
- 1 day from start to ship

**Git range:** `32687b1` → `086b007`

**What's next:** Renewal management, additional payment sources (Venmo, Zelle), or other SAC improvements

---

## v1.1 FB-YT Archive Improvements (Shipped: 2026-01-29)

**Delivered:** Simplified Facebook Live video archival — drop zip in inbox, run script, done.

**Phases completed:** 6 (3 plans total, Phase 7 skipped)

**Key accomplishments:**

- Registry infrastructure with fbid tracking and atomic writes for crash safety
- Inbox scanning with auto-discovery of unprocessed Facebook export zips
- Zip extraction with TemporaryDirectory auto-cleanup
- Full cross-zip deduplication (silent skip) and intra-zip deduplication (warning)
- Daily quota enforcement with upload counting
- Colored console output with summary display

**Stats:**

- 4 files modified
- +1,166 / -40 lines
- 1 phase, 3 plans, 7 tasks
- 3 days from start to ship

**Git range:** `f154a9e` → `4edee1a`

**What's next:** Additional archive features (auto-scheduling, improved metadata), or other SAC website improvements

---

## v1.0 Next.js 15 Migration (Shipped: 2026-01-27)

**Delivered:** Incremental migration from Next.js 12 to Next.js 15 with App Router, maintaining full site functionality throughout.

**Phases completed:** 1-5 (15 plans total)

**Key accomplishments:**

- Removed Preact aliasing to establish pure React baseline for Server Components
- Upgraded to Next.js 15.5.10 + React 19.2.4 + Tailwind CSS 4.1.18
- Created App Router infrastructure (root layout, providers, theme system)
- Migrated 10 static pages to App Router: home, about, contact, events, membership, weather, brand, donate, links, id
- Maintained blog and gallery on Pages Router for incremental migration
- Production verified with manual testing, ESLint flat config migration

**Stats:**

- 44 files created/modified
- +632 / -521 lines changed
- 5 phases, 15 plans, 24 commits
- 2 days from start to ship

**Git range:** `92666c4` → `870d17a`

**What's next:** Blog migration (MDX to App Router), Gallery migration (S3 integration), API route conversion to Route Handlers

---

## v1.5 Calendar-Year Membership Rules (Shipped: 2026-02-12)

**Delivered:** Calendar-year membership expiration rules replacing rolling 12-month model, and workspace account generation from the admin dashboard.

**Phases completed:** 17-18 (3 plans total)

**Key accomplishments:**

- Calendar-year membership expiration with H1/H2 coverage rules (16 TDD tests)
- Full workspace account creation chain: client hook → Next.js API → Apps Script → Google Workspace
- Client-side email candidate generator mirroring Apps Script naming strategy
- WorkspaceAccountModal with disabled-by-default select and confirmation toggle
- Ad-hoc: Expirados dashboard card, payments multi-select pill filters, badge color improvements

**Stats:**

- 20 files created/modified
- +1,757 / -102 lines
- 2 phases, 3 plans, 7 tasks
- 2 days from start to ship (2026-02-11 → 2026-02-12)

**Git range:** `b882e94` → `3c91138`

**What's next:** Notifications, member self-service, or other SAC improvements

---


## v1.6 Article Manager (Shipped: 2026-02-17)

**Delivered:** Replaced manual MDX-file-and-git workflow with an admin dashboard article manager backed by S3, including full content migration.

**Phases completed:** 19-22 (4 phases, 7 plans, 16 tasks)

**Key accomplishments:**

- S3 article data layer with CRUD utilities, automatic index management, and 26 unit tests
- Blog fully migrated from Pages Router + local MDX files to App Router + S3 via next-mdx-remote
- 77 articles and 215 images (~133 MB) migrated from repo to S3 as single source of truth
- Admin article manager: list page with status/search/tag filters, new/edit/delete, publish/draft toggle
- CodeMirror markdown editor with live MDX preview using same remark/rehype pipeline as public blog
- Image upload to S3 via toolbar button and drag-and-drop, inserting `<Image>` component with real dimensions
- Component insert menu for YouTube, Facebook, Twitter/X embeds and TOC
- Native YouTube/Facebook iframes replaced react-player, eliminating console warning spam

**Stats:**

- 355 files changed, +7,025 / -5,966 lines
- 4 phases, 7 plans
- 5 days from start to ship (2026-02-12 → 2026-02-17)

**Git range:** `0e5759d` → `f744234`

**What's next:** Article notifications, author management, or other SAC improvements

---


## v1.7 Members Map View (Shipped: 2026-02-25)

**Delivered:** Interactive Leaflet/OpenStreetMap member map with lazy geocoding, side panel, and radius-based area filtering for the admin dashboard.

**Phases completed:** 23-25 (3 phases, 5 plans, 16 requirements)

**Key accomplishments:**

- Geocoding library with Google Geocoding API, 200ms rate limiting, and lazy sheet caching (geocode once, read from spreadsheet thereafter)
- Auto-geocode on map view load — skips members without address data, uses ref guard to prevent re-triggers
- Apps Script geo column invalidation when address changes, with protection for existing operations (scan, manual payment, workspace)
- Interactive Leaflet map with member pins, hover/click popups, and inline status badges
- ViewToggle component with localStorage persistence for grid/map switching
- Scrollable side panel with member list, location status grouping, and "Sin coordenadas" indicators
- Click-to-place circle filter with haversine distance calculation and adjustable radius slider (1-50km)
- CSP header updated for Leaflet CSS CDN loading

**Stats:**

- 10 files changed, +798 / -34 lines
- 3 phases, 5 plans
- 5 days from start to ship (2026-02-20 → 2026-02-25)

**Git range:** `f794e3e` → `709b1d5`

**What's next:** Member clustering, heat maps, status filtering on map, or other SAC improvements

---


## v1.8 Member Profiles & ID Cards (Shipped: 2026-03-02)

**Phases completed:** 31 phases, 68 plans, 16 tasks

**Key accomplishments:**
- (none recorded)

---

