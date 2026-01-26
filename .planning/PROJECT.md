# SAC Website Next.js 15 Migration

## What This Is

Incremental migration of the Sociedad de Astronomía del Caribe (SAC) website from Next.js 12 (Pages Router) to Next.js 15 (App Router). The site serves Puerto Rico's astronomy community with blog posts, photo galleries, event information, and membership management — all in Spanish.

## Core Value

The site must remain fully functional during migration — no broken pages, no lost SEO, no deployment failures.

## Requirements

### Validated

<!-- Existing capabilities that work and must continue working -->

- ✓ MDX blog with static generation, syntax highlighting, math rendering — existing
- ✓ Photo gallery with AWS S3 integration, year/month filtering, lightbox — existing
- ✓ NASA Astronomy Picture of the Day integration — existing
- ✓ Newsletter subscriptions (Mailchimp/Buttondown/ConvertKit) — existing
- ✓ Dark/light theme toggle — existing
- ✓ SEO meta tags and social sharing — existing
- ✓ Responsive design with Tailwind CSS — existing
- ✓ Spanish locale (es-PR) throughout — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Upgrade to Next.js 15
- [ ] Remove Preact aliasing (enable Server Components)
- [ ] Set up App Router (`app/` directory structure)
- [ ] Migrate root layout (global providers, theme, navigation)
- [ ] Migrate home page to App Router
- [ ] Migrate static pages: about, contact, events, membership, weather, brand, donate, links
- [ ] Verify Vercel deployment succeeds
- [ ] All migrated pages render correctly with existing styles

### Out of Scope

<!-- Explicit boundaries for this milestone -->

- Blog migration — MDX complexity, defer to future milestone
- Gallery migration — S3 integration complexity, defer to future milestone
- API route migration to Server Actions — keep in pages/api for now
- TypeScript conversion — stay JavaScript for this milestone
- Tailwind v4 upgrade — one major upgrade at a time

## Context

**Current state:**
- Next.js 12.1.0 with Pages Router
- React 17.0.2 with Preact aliasing in production
- Tailwind CSS 2.2.2
- Deployed on Vercel

**Migration approach:**
Next.js supports running `pages/` and `app/` directories simultaneously. This enables incremental migration — new/migrated pages use App Router while existing pages continue working.

**Key files to modify:**
- `next.config.js` — Remove Preact aliasing, update for Next.js 15
- `package.json` — Upgrade dependencies
- Create `app/` directory structure with layouts
- Migrate page components one at a time

**Codebase reference:**
See `.planning/codebase/` for detailed architecture, stack, and structure documentation.

## Constraints

- **Compatibility**: Site must remain functional on Vercel throughout migration
- **Incremental**: No big-bang rewrite — migrate pages one at a time
- **Styling**: Keep Tailwind CSS working with existing class names
- **Content**: Blog posts and gallery must continue working (stay on Pages Router)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Incremental migration over full rewrite | Lower risk, site stays live, learn as we go | — Pending |
| Remove Preact aliasing | Required for Server Components, worth the bundle size trade-off | — Pending |
| Start with static pages | Simpler migration, establish patterns before complex pages | — Pending |
| Keep blog/gallery on Pages Router | MDX and S3 integration need more research for App Router | — Pending |

---
*Last updated: 2026-01-26 after initialization*
