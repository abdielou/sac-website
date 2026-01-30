# SAC Website Next.js 15 Migration

## What This Is

Sociedad de Astronomia del Caribe (SAC) website running on Next.js 15 (App Router) with React 19 and Tailwind CSS 4. The site serves Puerto Rico's astronomy community with blog posts, photo galleries, event information, and membership management — all in Spanish.

## Core Value

The site must remain fully functional during migration — no broken pages, no lost SEO, no deployment failures.

## Requirements

### Validated

- Upgrade to Next.js 15 — v1.0
- Remove Preact aliasing (enable Server Components) — v1.0
- Set up App Router (`app/` directory structure) — v1.0
- Migrate root layout (global providers, theme, navigation) — v1.0
- Migrate home page to App Router — v1.0
- Migrate static pages: about, contact, events, membership, weather, brand, donate, links, id — v1.0
- Verify Vercel deployment succeeds — v1.0
- All migrated pages render correctly with existing styles — v1.0
- MDX blog with static generation, syntax highlighting, math rendering — existing
- Photo gallery with AWS S3 integration, year/month filtering, lightbox — existing
- NASA Astronomy Picture of the Day integration — existing
- Newsletter subscriptions (Mailchimp/Buttondown/ConvertKit) — existing
- Dark/light theme toggle — existing (upgraded to next-themes 0.4.6)
- SEO meta tags and social sharing — existing (using Metadata API)
- Responsive design with Tailwind CSS — existing (upgraded to v4.1.18)
- Spanish locale (es-PR) throughout — existing

### Active

- PayPal email parsing in membership payment scanner — v1.2

### Validated (v1.1)

- Inbox folder scanning for unprocessed zip files — v1.1
- Automatic extraction, processing, and cleanup — v1.1
- Deduplication via Facebook video ID (`fbid`) — v1.1
- Central registry in script directory — v1.1

### Out of Scope

- Blog migration — MDX complexity, defer to future milestone
- Gallery migration — S3 integration complexity, defer to future milestone
- API route migration to Route Handlers — keep in pages/api for now
- TypeScript conversion — stay JavaScript for this milestone

## Current Milestone: v1.2 PayPal Payment Support

**Goal:** Add PayPal email parsing to the membership payment scanner so PayPal payments are automatically captured alongside ATH Movil payments.

**Target features:**
- Parse PayPal "Payment received" email notifications
- Extract: amount, sender email, sender name, transaction ID, date, message
- Integrate with existing `onNewMemberships` flow (same matching and processing)

## Current State

**v1.1 shipped:** FB-YT Archive script now supports drop-and-run workflow with full deduplication.

**v1.2 in progress:** Adding PayPal payment support to membership management script.

## Context

**Current state (v1.0 shipped):**
- Next.js 15.5.10 with App Router (static pages) + Pages Router (blog, gallery)
- React 19.2.4
- Tailwind CSS 4.1.18 with @config directive
- next-themes 0.4.6 with App Router support
- ESLint 9 flat config
- Deployed on Vercel

**Tech stack:**
- 10 pages on App Router: home, about, contact, events, membership, weather, brand, donate, links, id
- Blog and gallery remain on Pages Router (incremental migration)
- API routes in pages/api (mailchimp, buttondown, convertkit, apod, photos, get-years)

**FB-YT Archive Script (`scripts/fb-yt-archive/`):**
- Python script to upload Facebook Live videos to YouTube
- Monthly Facebook data exports (zips) stored in `C:\Users\abdie\Documents\sac\`
- Videos identified by `fbid` in metadata JSON
- Current workflow is manual: extract, run, cleanup

**Membership Management Script (`appsscript/CreateUser.js`):**
- Google Apps Script for automated membership processing
- Currently parses ATH Movil payment emails via `extractPaymentData()`
- Scheduled job `onNewMemberships` scans Gmail for payment notifications
- Matches payments to members in CLEAN sheet, triggers account creation
- Tracks membership status (ACTIVE/EXPIRED/NO_PAYMENT) with rolling 1-year validity

**Known issues:**
- Jest SVG import configuration (one test suite fails)
- Windows build race conditions (flaky, requires multiple build attempts)
- PayPal payments not being captured (only ATH Movil supported)

## Constraints

- **Compatibility**: Site must remain functional on Vercel throughout migration
- **Incremental**: No big-bang rewrite — migrate pages one at a time
- **Styling**: Keep Tailwind CSS working with existing class names
- **Content**: Blog posts and gallery must continue working (stay on Pages Router)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Incremental migration over full rewrite | Lower risk, site stays live, learn as we go | Good |
| Remove Preact aliasing | Required for Server Components, worth the bundle size trade-off | Good |
| Start with static pages | Simpler migration, establish patterns before complex pages | Good |
| Keep blog/gallery on Pages Router | MDX and S3 integration need more research for App Router | Good |
| Server/Client Component split pattern | Server fetches data, Client handles interactivity | Good |
| ESLint flat config with direct CLI | Avoids next lint wrapper issues | Good |
| Upgrade to Tailwind CSS 4 | Better performance, modern syntax | Good |

---
*Last updated: 2026-01-30 after v1.2 milestone started*
