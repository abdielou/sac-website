# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** v1.5 Calendar-Year Membership Rules - Phase 18

## Current Position

Phase: 18 of 18 (Workspace Account Generation)
Plan: 1 of 2 in current phase
Status: Plan 18-01 complete, executing Phase 18
Last activity: 2026-02-11 — Completed 18-01-PLAN.md

Progress: [███████░░░] 75% (1.5/2 phases complete)

## Milestone History

- **v1.4 Payment Classification & Apps Script Triggers** - Shipped 2026-02-10
  - 4 phases (13-16), 7 plans
  - Payment classification, Apps Script web app, scan & manual payment UI

- **v1.3 Admin Dashboard** - Shipped 2026-02-05
  - 5 phases (08-12), 11 plans
  - Auth + Google Sheets + Dashboard + Members/Payments lists

- **v1.2 PayPal Payment Support** - Shipped 2026-01-30
  - 1 phase, 2 plans
  - PayPal email parsing with sender validation

- **v1.1 FB-YT Archive Improvements** - Shipped 2026-01-29
  - 1 phase, 3 plans
  - Full inbox processing with deduplication

- **v1.0 Next.js 15 Migration** - Shipped 2026-01-27
  - 5 phases, 15 plans
  - See .planning/MILESTONES.md for details

## Blockers/Concerns

- Production OAuth needs AUTH_URL env var + Authorized JavaScript origins in Google Cloud Console
- Apps Script Web App deployment is manual (requires Google Apps Script editor)
- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js cause build failures

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 18-01-PLAN.md
Resume file: None

## Decisions

- Use UTC date methods for timezone-independent membership status calculation
- Injectable `now` parameter for test determinism (avoids jest.useFakeTimers)
- Mock heavy dependencies in tests to bypass ESM-only ky dependency in Jest
- Admin-selected sacEmail bypasses server-side availability check (trusted admin selection)
- Client-side email generator mirrors Apps Script logic exactly for preview consistency
