# Roadmap: SAC Website

## Milestones

- v1.0 MVP - Phases 1-5 (shipped 2026-01-27)
- v1.1 FB-YT Archive - Phase 6 (shipped 2026-01-29)
- v1.2 PayPal Payments - Phase 7 (shipped 2026-01-30)
- v1.3 Admin Dashboard - Phases 8-12 (shipped 2026-02-05)
- v1.4 Payment Classification & Apps Script - Phases 13-16 (shipped 2026-02-10)
- v1.5 Calendar-Year Membership Rules - Phases 17-18 (in progress)

## Phases

<details>
<summary>v1.0 through v1.4 (Phases 1-16) - SHIPPED</summary>

See .planning/MILESTONES.md for details on shipped milestones.

</details>

### v1.5 Calendar-Year Membership Rules (In Progress)

**Milestone Goal:** Replace rolling 12-month expiration with calendar-year-based coverage rules that match how SAC actually manages memberships.

#### Phase 17: Calendar-Year Expiration Rules
**Goal**: Membership status accurately reflects calendar-year coverage so admins see correct active/expiring/expired states year-round
**Depends on**: Phase 16 (v1.4 shipped)
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-07
**Success Criteria** (what must be TRUE):
  1. Member who paid in January shows as "active" with expiration date Dec 31 of that year
  2. Member who paid in October shows as "active" with expiration date Dec 31 of next year
  3. Member whose coverage ended last Dec 31 shows as "expiring-soon" when viewed in January or February
  4. Member whose coverage ended last Dec 31 shows as "expired" when viewed in March or later
  5. Member without SAC email still shows as "applied" regardless of payment date
**Plans**: 1 plan

Plans:
- [x] 17-01-PLAN.md — TDD: Calendar-year membership status calculation (rewrite calculateMembershipStatus with H1/H2 coverage rules, grace period, tests)

#### Phase 18: Workspace Account Generation
**Goal**: Admins can generate @sociedadastronomia.com workspace accounts for members directly from the dashboard, reducing old unaccounted members in the expired list
**Depends on**: Phase 17 (calendar-year rules)
**Requirements**: WKSP-01, WKSP-02, WKSP-03, WKSP-04, WKSP-05
**Success Criteria** (what must be TRUE):
  1. Kebab menu for a member WITHOUT sacEmail shows "Generar Cuenta Workspace" option
  2. Kebab menu for a member WITH sacEmail does NOT show the workspace option
  3. Modal displays email candidates derived from member's name
  4. Admin can select an email and trigger workspace account creation via Apps Script
  5. After creation, the member row shows the new sacEmail and status updates accordingly
**Plans**: 2 plans

Plans:
- [ ] 18-01-PLAN.md — Backend + utility: Apps Script action, API route, mutation hook, email candidate generator, member name parts
- [ ] 18-02-PLAN.md — UI: WorkspaceAccountModal, MemberActions WORKSPACE option, members page wiring

## Progress

**Execution Order:** Phase 17 → Phase 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 17. Calendar-Year Expiration Rules | v1.5 | 1/1 | Complete | 2026-02-11 |
| 18. Workspace Account Generation | v1.5 | 0/2 | Not started | - |
