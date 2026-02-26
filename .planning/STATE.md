# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Admins can accurately track membership status and payments so that no member falls through the cracks.
**Current focus:** Phase 27 — Member Authentication

## Current Position

Phase: 27 (2 of 5 in v1.8) — Member Authentication
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase Complete
Last activity: 2026-02-26 — Completed 27-02-PLAN.md

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 58 (across v1.0-v1.8)
- Average duration: ~30 min
- Total execution time: ~26 hours

**Recent Trend (v1.7):**
- 5 plans across 3 phases in 5 days
- Trend: Stable

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [27-02]: Admin route checks ordered before member route checks in proxy.js for correct precedence
- [27-02]: Non-admin users on /admin redirected to /member (not sign-in) since already authenticated
- [27-01]: isMember from JWT token, isAdmin from permissionChecker -- intentional dual source
- [27-01]: token.isAdmin supplementary for proxy.js; session.user.isAdmin from permissionChecker is authoritative
- [26-02]: proxy.js logic kept identical to middleware.js -- only export pattern changed
- [26-02]: Dev server requires --webpack flag (Turbopack not yet compatible with webpack config)
- [26-01]: No --legacy-peer-deps needed: next-auth beta.30 resolved cleanly with next@16
- [26-01]: Used --webpack flag in build/analyze scripts for Turbopack opt-out
- [v1.8 Roadmap]: Next.js 16 migration first — proxy.js rename affects all auth code
- [v1.8 Roadmap]: Google Drive for photo storage — reuses service account pattern, no new vendor
- [v1.8 Roadmap]: @react-pdf/renderer for ID cards — JSX-based, fits React model

### Research Flags

- Phase 26: VERIFIED - hybrid pages/ + app/ router works under --webpack after upgrade
- Phase 28: Resolve Drive folder access model (direct share vs domain-wide delegation) before coding
- Phase 29: Build @react-pdf/renderer proof-of-concept before full templates

### Blockers/Concerns

- Auth.js beta.30 peer dependency resolved cleanly (no longer a concern)
- Pre-existing prettier errors in AdminHeader.js, members/page.js, payments/page.js must be fixed in Phase 26

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 27-02-PLAN.md (Phase 27 complete)
Resume file: None
