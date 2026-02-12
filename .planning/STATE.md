# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Admins can accurately track membership status and payments
**Current focus:** v1.6 Article Manager — Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-12 — Milestone v1.6 started

Progress: [░░░░░░░░░░] 0%

## Milestone History

- **v1.5 Calendar-Year Membership Rules** - Shipped 2026-02-12
  - 2 phases (17-18), 3 plans
  - Calendar-year expiration rules, workspace account generation

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

Last session: 2026-02-12
Stopped at: Defining v1.6 requirements
Resume file: None

## Decisions

- S3-only for article storage (no database) — already have AWS credentials, zero new infra
- Migrate all existing blog content + images to S3 — single source of truth
- Keep author files as data/authors/*.md — low volume, rarely changes
