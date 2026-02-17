# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** v1.6 Article Manager — Phase 22 (Article Manager)

## Current Position

Phase: 22 of 22 (Article Manager)
Plan: 2 of 2 in current phase
Status: Complete
Last activity: 2026-02-17 — Completed 22-02 (Article Editor)

Progress: [##########] 100% (Phase 22) | Plan 2/2 (Phase 22)

## Performance Metrics

**Velocity:**
- Total plans completed: 49 (across v1.0-v1.6)
- Average duration: ~27 min
- Total execution time: ~22.6 hours

**Recent Trend (v1.6):**
- 7 plans in session
- Phase 19-01: 5 min (3 tasks, 4 files)
- Phase 20-01: 8 min (3 tasks, 13 files)
- Phase 20-02: 3 min (2 tasks, 6 files)
- Phase 21-01: 3 min (2 tasks, 2 files)
- Phase 21-02: ~2h interactive (3 tasks, 16 files — includes user spot-checking and iterative fixes)
- Phase 22-01: 7 min (2 tasks, 6 files)
- Phase 22-02: 8 min (2 tasks, 11 files)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

- S3-only for article storage (no database) — already have AWS credentials, zero new infra
- Migrate all existing blog content + images to S3 — single source of truth
- Keep author files as data/authors/*.md — low volume, rarely changes
- Articles stored as JSON (not MDX) in S3 — simpler parsing, no build-time bundler needed
- Separate S3_ARTICLES_BUCKET_NAME from gallery S3_BUCKET_NAME — isolated article storage
- Date-path slug format YYYY/MM/DD/title-slug — preserves existing blog URL structure
- Lazy-initialized S3 client (module-level singleton) — created on first call for performance
- Cold-start index handling — getArticleIndex returns empty index when no index.json exists
- Use next-mdx-remote instead of mdx-bundler for S3 content — simpler serialization model
- Split post rendering: server component for data/metadata, client component for MDX rendering
- Removed Pages Router blog files immediately (not Phase 21) — route conflicts blocked App Router migration
- Graceful S3 bucket check allows builds without S3 configuration — development/CI friendly
- Tag counts computed from S3 article index (not separate tag aggregation)
- Tag URLs use kebab-case, matched via kebabCase(tag) comparison on both sides
- RSS feed as route handler (not build-time file write) for dynamic S3 content
- Revalidation API always clears /blog and /tags on any mutation (aggregate pages)
- Filesystem slug preservation for migration (not regenerated from title) to maintain existing blog URLs
- Two-phase migration: images first, then articles, to ensure all image URLs are valid before article upload
- Bulk index build after all articles (not incremental per-article) for migration efficiency
- Inline S3 calls in migration script (CommonJS cannot import ESM lib/articles-s3.js)
- Replaced react-player with native YouTube/Facebook iframe embeds — eliminates console warning spam
- MDXComponents map must NOT have 'use client' for RSC MDXRemote — split into 3 files
- Image component falls back to native <img> when width/height missing — S3 content lacks dimensions
- Removed KaTeX stylesheets — not used by any blog content
- Original blog files archived on backup/pre-s3-migration branch for rollback safety
- Article admin API uses same auth pattern as members/payments (import auth, wrap handlers, Spanish 401 message)
- S3_IMAGES_BUCKET_NAME for image uploads separate from S3_ARTICLES_BUCKET_NAME
- Article list uses useState+useEffect+fetch (not TanStack Query) since S3 data doesn't need Google Sheets caching
- Catch-all [...slug] route with await params for Next.js 15 async params compatibility
- Dynamic import for CodeMirror (next/dynamic with ssr:false) to avoid SSR hydration issues
- Client-side MDXRemote from next-mdx-remote (not /rsc) for preview since editor is client component
- Preview API uses serialize() with same remark/rehype plugins as public blog for rendering parity
- Editor page split into outer (data loading) and inner (editor hook) components — useArticleEditor needs initialArticle at mount

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Blog currently on Pages Router (pages/blog/) — rendering phase must work within that constraint~~ — RESOLVED: Migrated to App Router, Pages Router blog files removed
- ~~Current blog uses mdx-bundler at build time with custom components — must preserve component rendering~~ — RESOLVED: Using next-mdx-remote, all components preserved
- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js cause build failures
- Article tests failing without S3 configuration — need test environment setup or mock data

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 22-02-PLAN.md (Article Editor) — Phase 22 complete, all v1.6 plans done
Resume file: None
