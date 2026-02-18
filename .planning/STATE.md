# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** Planning next milestone

## Current Position

Phase: v1.6 complete — all 22 phases, 49 plans done
Status: Between milestones
Last activity: 2026-02-17 — Completed v1.6 milestone (Article Manager), tagged v1.6

## Accumulated Context

### Decisions (stable — see PROJECT.md for full list)

Key patterns established across v1.6:
- S3 JSON storage for articles with automatic index management
- MDXComponents split: pure map file (no 'use client') consumed by RSC, client wrappers separate
- Admin API auth pattern: import auth, wrap handlers, Spanish 401 message
- CodeMirror in App Router: dynamic import ssr:false, insertAtCursor utility exported from editor
- Debounced MDX preview: 500ms debounce + AbortController + same remark/rehype as public blog

### Pending Todos

None.

### Blockers/Concerns

- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js cause build failures
- Article tests require S3 configuration (S3_ARTICLES_BUCKET_NAME) — no mock data in test env

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed v1.6 milestone — archived, tagged, ready for next milestone
Resume file: None
