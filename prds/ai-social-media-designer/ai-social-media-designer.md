# AI Social Media Designer

**Type:** PRD · **Audience:** Engineering · **Status:** Approved

---

## Scope commitment

| Item | MVP decision |
|------|----------------|
| **Audience** | Admin and authorized comms users only (`/admin/ai`). No member-facing access. |
| **Authorization** | Integrates with the repository’s existing feature-based `ADMIN_PERMISSIONS` model (`lib/permissions.js`, `lib/api-permissions.js`, `auth()`). Reuse centralized auth and permission helpers/patterns — do **not** introduce a second authorization system or manually parse permissions inside AI routes. |
| **AI permissions** | `read_ai` — view the AI tab read-only. `write_ai` — use the AI Social Media Designer (start validation/generation and manage guidelines); implies `read_ai`. Under the existing model, `read_*` includes `read_ai` and `write_*` includes `write_ai` (and thus `read_ai`). |
| **MVP scope** | **Phase 1:** Validation (text + images). **Phase 2:** Generation (text + images). **Phase 3:** Guideline management. |
| **Publishing** | None. Users copy/download outputs and publish manually. |
| **RAG / video** | Future phases. |
| **Generation→validation loop** | Future phase (post-MVP). Users copy/download and validate manually in MVP. |
| **Guidelines UI** | Phase 3 — full guideline management UI (draft editing, activation, version history, rollback, audit log). |
| **Orchestration** | Vercel Workflows from Phase 1A (backend); validation UI in 1B; generation UI in 2B; guidelines UI in Phase 3. |
| **Storage** | **Live run state:** Vercel Workflows (source of truth for queued/running/completed/failed, progress, retries/resume). **Persistent run history:** S3 audit metadata for completed/failed runs. **Guidelines:** S3-backed versioned store via `guidelines-store` (Phase 3) — confirmed stakeholder requirement. No database for MVP run history. |

---

## Summary

AI-assisted admin dashboard for SAC communications: **validate** proposed posts and **generate** drafts for X, Instagram, and Facebook. Guideline-driven, human-in-the-loop. Validation and generation run as durable Vercel Workflows (live execution state). S3 stores persistent AI run history/audit metadata and, in Phase 3, versioned guidelines (confirmed: draft/active, history, activation, rollback, audit). Spanish-first. AI never publishes or approves content.

---

## Mockups

![Validation workflow](./mockups/validation.png)

![Guideline management](./mockups/guidelines-management.png)

---

## Problem

SAC publishes across multiple channels; quality depends on manual review and informal knowledge. **Risks:** off-brand tone, incomplete events, overconfident astronomy claims, privacy leaks, revision cycles. **Solution:** AI workspace against SAC guidelines; humans approve and publish.

---

## Goals and metrics

**Goals:** Validate drafts; generate editable text/images; support X/Instagram/Facebook; apply SAC guidelines; preserve human review; copy/download outputs.

| Metric | Target |
|--------|--------|
| Revision cycles per post | Reduce (baseline in Phase 0) |
| Time to review-ready draft | Reduce |
| Comms lead confidence | Improve |

**Quality gates:** ≥90% structured output validity · ≥85% validation outcomes (text + image) · ≥90% fact preservation in generation · ≥85% image guardrail outcomes · 0 privacy leaks · 0 auto-approval claims.

---

## Non-goals (MVP)

Auto-publish/schedule · replace human approval · custom model training · RAG · video validation · image editing · analytics · editorial queues · member access · platform OAuth/APIs · one-click cross-platform publish.

---

## Users

| Persona | Need |
|---------|------|
| Communications lead | Confidence posts follow guidelines |
| Communications volunteer | Faster drafts, clear feedback |
| Authorized admin | Permission-aware, auditable AI use |
| Astronomy contributor | Technical meaning preserved |

**User stories:** Validate drafts · flag off-brand/risky content · generate text/images (Phase 2) · see assumptions and suggested edits · update guidelines without code (Phase 3) · permission-controlled access · AI assists, never auto-publishes.

---

## Enums

**Platforms:** `x` · `instagram` · `facebook`

**Content types:**

| Value | Description |
|-------|-------------|
| `regular_post` | Standard text post |
| `caption` | Caption for image/media |
| `image_post` | Image post + caption; upload validation + generated images (Phase 2) |
| `carousel` | Carousel; upload validation + generated images (Phase 2) |
| `reel_caption` | Reel caption text only — no video |
| `event_promotion` | Event announcement |
| `educational_astronomy` | Public astronomy content |
| `member_update` | Member/community update |

**UI labels → enums:** Event → `event_promotion` · Educational → `educational_astronomy` · Informational → `regular_post`/`caption`/`member_update` · Promotional → `regular_post`/`image_post`/`carousel`

**Outcomes:** `pass` · `warning` · `fail` · **Severity:** `critical` · `major` · `minor` · `suggestion`

---

## Functional requirements

### Dashboard

- Tab at `/admin/ai` requires `read_ai` (same feature-gate pattern as other admin tabs — e.g. session `accessibleFeatures` / `PermissionGate`).
- Starting validation or generation workflows requires `write_ai`.
- Permissions come from the existing `ADMIN_PERMISSIONS` feature model (`ai` is a feature alongside members, payments, articles, etc.). `write_ai` implies `read_ai`; existing wildcards `read_*` / `write_*` already expand to include `read_ai` / `write_ai` — do not invent a separate wildcard implementation for AI.
- Workflows: **Validate** and **Generate**.
- Spanish-first; MVP assumes Spanish posts.
- Advisory messaging; no publish/schedule actions.
- One platform at a time for validation.
- Platform/content-type selectors read from active guidelines when possible, with MVP defaults as fallback.

### Core AI behavior

- Structured JSON, schema-validated.
- Active guidelines loaded at request time via `getActiveGuidelines()` — configurable behavior layer, not static prompts.
- Combines global + platform + content-type guidelines + user input.
- Only activated guideline versions affect behavior.
- Server-side model calls only; safe errors preserve user input.
- Audit via server logs + live workflow metadata + `AiRunHistoryRecord` objects written to S3 when a run reaches a terminal state (sparse audit metadata — see Data model).

### Output model

Review-ready content only. Users copy feedback/text, download images, export drafts. No platform OAuth, posting APIs, or scheduling.

---

## Validation agent (Phase 1)

**Inputs:** Platform · content type · draft text · optional images for `image_post`/`carousel` · optional goal, audience, CTA, hashtags, links, event details, alt text.

**Outputs:**

| Field | Notes |
|-------|-------|
| `overallOutcome` | `pass` / `warning` / `fail` |
| `approvalRecommendation` | `ready_for_review` / `needs_edits` / `do_not_publish` |
| `summary` | Short review |
| `issues[]` | severity, category, message, suggestedFix, affectedPlatform |
| `platformNotes` | Platform-specific feedback |
| `imageNotes` | Per-image feedback when applicable |
| `suggestedRevision` | Optional improved draft |
| `humanReviewRequired` | Always `true` |

**Categories:** Brand voice · guideline compliance · platform fit · clarity · completeness · uncertainty/factual risk · accessibility · safety · formatting · privacy · image-text alignment · image suitability.

**Astronomy:** Flags overconfident/unverifiable claims — does **not** verify facts.

**Platform rules:** X — character limits, hashtags. Instagram — caption quality, image validation. Facebook — complete event details, CTA, image-text alignment.

**Content-type rules:** Event promotion requires name/date/time/location/CTA. Educational — flag overconfident claims. Member update — no private data. Image post/carousel — validate images + caption. Reel caption — text only.

---

## Generation agent (Phase 2)

**Inputs:** Intent, topic, platform(s), content type, tone, image style/constraints.

**Outputs:** Spanish draft per platform · image prompt(s) · generated image asset(s) · rationale · assumptions · missing info · `humanReviewRequired: true` · recommended next step (validate before approval).

**Guardrails:** No invented dates/times/locations/costs/links/scientific facts. No images implying unprovided facts, identifiable people, minors, private info, official logos, or copyrighted styles. No SAC-approval claims. Regeneration preserves user facts.

---

## Communication guidelines

Guidelines are the editable layer between comms stakeholders and AI workflows. **Confirmed stakeholder requirement:** S3-backed versioned guidelines with draft/active separation, version history, activation, rollback, and audit log — one active version at a time; published (activated) historical versions are immutable. Phase 3 implements this via `guidelines-store` (reuse SAC's existing S3 pattern). Comms users edit via dashboard forms — not GitHub, raw JSON, or S3 directly.

| Scope | Examples |
|-------|----------|
| **Global** | SAC voice, Spanish-first, privacy, safety, factual caution, accessibility |
| **Platform** | Character limits, tone, hashtags, media requirements |
| **Content-type** | Required fields, missing-info checks, structure, severity defaults |

**Version control (required):**

| Rule | Behavior |
|------|----------|
| One active version | Exactly one guideline version is active at a time; only that version affects AI behavior |
| Immutable published history | Once activated/published, a version is immutable; edits happen on drafts, not by mutating history |
| Draft editing | Create a draft from the active (or a prior) version; edit sections; save without affecting live behavior |
| Activation | Promote a validated draft to active; previous active becomes historical |
| Rollback | Re-activate a prior published version (creates a new active pointer / activation event; does not rewrite history) |
| Audit log | Record create/save/activate/rollback events (`AiGuidelineAuditEvent`) |

**Phase 3 UI** (stays in Phase 3 — do not pull full management UI earlier): Active overview · draft from active version · section editing · preview against sample post · activation · version history · rollback · audit log. Backend validates before save/activation. UI hides AWS/S3 terminology.

**Accessors:** `getActiveGuidelines()` · `listGuidelineVersions()` · `createGuidelineDraft()` · `saveGuidelineDraft()` · `activateGuidelineVersion()` · `rollbackGuidelineVersion()`

**Gate:** Phase 0 seeds initial guidelines; Phases 1–2 consume them via `getActiveGuidelines()` (stub/defaults until Phase 3 ships). Phase 3 delivers the full versioned store, draft/active lifecycle, and management UI.

---

## Technical architecture

| Layer | Choice |
|-------|--------|
| **UI** | `app/admin/ai/*` — gated with the same admin feature patterns as other tabs (`auth()`, `accessibleFeatures` / `PermissionGate`; requires `read_ai`) |
| **API** | `app/api/admin/ai/*` — `auth()` + centralized helpers from `lib/api-permissions.js` (`checkPermission` / `checkReadAccess` / `requirePermission`) and `lib/permissions.js` (`hasPermission`, etc.). No ad-hoc permission parsing in AI routes. |
| **Authorization model** | Existing feature-based `ADMIN_PERMISSIONS` (`read_ai` / `write_ai`; wildcards `read_*` / `write_*` as already implemented in `lib/permissions.js`) |
| **Orchestration** | Vercel Workflows (`'use workflow'` + `'use step'`) — live execution source of truth |
| **AI** | OpenRouter via Vercel AI SDK (or equivalent) in workflow steps |
| **Guidelines** | `guidelines-store` → S3 (Phase 3) — versioned; one active; immutable published history |
| **Live run state** | Vercel Workflows — queued/running/completed/failed, progress, durable execution, retries/resume, step results |
| **Persistent run history** | S3 via `run-history-store` — historical/audit metadata for terminal runs; does **not** replace Workflows for live state |
| **Uploads** | Server-side; MIME/size/count limits; not persisted to S3 |
| **Generated images** | Retention TBD (stakeholder review); gated on usage rights + spend ceiling |
| **Rate limiting** | Per-user workflow start cap (keyed from authenticated session identity) |
| **Production** | Remove dev-only `NODE_ENV` gating before launch |

### API pattern

- `POST /api/admin/ai/validate` · `POST /api/admin/ai/generate` → `auth()` + enforce `write_ai` via centralized helpers → validate payload → start workflow with **session-derived** user identity → return `{ runId, status }`
- Workflow `userId` / ownership identity **must** be taken from the authenticated server-side session (`req.auth` / `auth()`). **Never** trust a `userId` or email supplied in the client request body.
- `GET /api/admin/ai/runs/:runId` → `auth()` + enforce `read_ai` → verify the caller is allowed to access that run (ownership check against workflow input metadata written from the session at start) → return status/result/error from **Vercel Workflows** (live state). **`runId` is not an authorization secret** — knowing a `runId` alone must not grant access. Run status/result access must always authenticate the caller and enforce the applicable authorization/ownership policy.
- UI may store `runId` in the URL (query or path) for refresh recovery; every poll and page load still calls the authenticated status route above.
- UI polls until complete/failed/timeout; preserves input on failure
- On terminal state (`completed` / `failed`), the workflow (or a final step) writes an `AiRunHistoryRecord` to S3. Live polling never depends on that write succeeding.

### Workflow steps

**Validation:** (1) validate payload/uploads (2) load guidelines (3) call model (4) validate schema (5) return `AiValidationResult` (6) persist `AiRunHistoryRecord` to S3

**Generation:** (1) validate payload (2) load guidelines (3) generate text (4) generate image prompt(s) (5) generate image asset(s) (6) validate output (7) return `AiGenerationResult` (8) persist `AiRunHistoryRecord` to S3

**Retries:** Transient failures at step level; malformed output retries once then fails safely. Runs survive deploys/crashes. History persistence failures are logged and must not change the workflow's terminal status returned to the client.

### Storage boundaries

| Data | Storage | MVP? |
|------|---------|------|
| Live run state, step results, retries/resume | Vercel Workflows | Yes — source of truth while a run is active and for status polling |
| Persistent run history / audit metadata (`AiRunHistoryRecord`) | S3 via `run-history-store` | Yes — written on terminal state; sparse fields; not used as live execution engine |
| Guidelines (versioned: draft / active / history / audit) | S3 via `guidelines-store` | Yes (Phase 3) — confirmed requirement |
| Uploaded validation images | Workflow payload | Yes — no S3 |
| Generated images | Stakeholder decision | TBD |
| Cross-run analytics / searchable history UI | Database | No — deferred; S3 history is audit/persistence only in MVP |

**S3 run-history key strategy** (stakeholder intent: `workflow/[user]/[timestamp]` with ms precision):

```
workflow-runs/{userKey}/{YYYY}/{MM}/{DD}/{timestamp}-{runId}.json
```

| Segment | Purpose |
|---------|---------|
| `workflow-runs/` | Prefix separating AI run history from guidelines and other buckets/prefixes |
| `{userKey}` | Stable opaque user identifier (e.g. session `userId`, stable id, or hash) — **not** raw email in object keys |
| `{YYYY}/{MM}/{DD}/` | Date partitioning for listing and retention |
| `{timestamp}` | UTC timestamp with millisecond precision (e.g. `20260709T235959.123Z` or epoch-ms) |
| `{runId}` | Vercel Workflows run id — collision avoidance and correlation with live workflow state |

History object contents are an `AiRunHistoryRecord` (see Data model) — audit/ops metadata correlated to a terminal `AiRun`, not a dump of live workflow state or arbitrary user payloads. Binary uploads, base64 image payloads, and generated image blobs are out of scope for this object unless a later retention decision says otherwise.

### Future

Generation→validation loop (2F): pre-fill validation from generated text/images; editable before validate; never bypasses human review. Neon/pgvector for RAG and searchable/analytics run history (S3 history remains the MVP audit store). RAG deferred until SAC confirms rights to historical posts — style/tone reference only, not factual verification.

---

## Data model and APIs

**Entities:** `AiRun` · `AiRunHistoryRecord` · `AiValidationResult` · `AiGenerationResult` · `AiDraftVariant` · `AiGeneratedImage` · `AiIssue` · `AiImageInput` · `AiGuideline` · `AiGuidelineVersion` · `AiGuidelineDraft` · `AiGuidelineAuditEvent` · `AiGuidelineActivation`

### Live vs persistent (do not conflate)

| Concept | Owner | Role |
|---------|-------|------|
| **`AiRun`** | Vercel Workflows | Product/API view of a **live** workflow execution — status polling, progress, retries/resume, step results. Source of truth while a run is active and for `GET .../runs/:runId`. |
| **`AiRunHistoryRecord`** | S3 via `run-history-store` | **Persistent** historical/audit metadata written when a run reaches a terminal state. Correlates to a workflow via `runId`. Does **not** own live workflow state and is **not** used for polling. |

S3 must not be treated as a substitute workflow engine. Workflows must not be treated as the long-term audit store.

### `AiRun` (live — Vercel Workflows)

Product/API view returned by status routes. Fields come from workflow execution and input metadata.

| Field | Notes |
|-------|-------|
| `runId` | Vercel Workflows run id |
| `mode` | `validate` or `generate` |
| `status` | `queued` · `running` · `completed` · `failed` |
| `userId` | Workflow input metadata from the **authenticated session** at start — ownership checks on status requests. Never taken from the client request body. |
| `inputSnapshot` | Request payload held in **workflow metadata for the life of the run** (retries, failure recovery, ownership). Not a promise of indefinite S3 retention of full user content — see history retention rules below. |
| `guidelineVersion` | Active version loaded for the run |
| `startedAt` / `finishedAt` | Workflow timestamps when available |
| `result` | `AiValidationResult` or `AiGenerationResult` when completed |
| `error` | Safe message when failed (no secrets, no stack traces to clients) |

### `AiRunHistoryRecord` (persistent — S3)

Durable audit/ops record written on terminal state (`completed` / `failed`). **All fields below are optional unless noted**; omit what is unavailable for a given run. Prefer sparse, safe metadata over completeness.

| Field | Required? | Notes |
|-------|-----------|-------|
| `schemaVersion` | Yes | Record shape version for forward-compatible reads |
| `runId` | Yes | Same id as the live `AiRun` — correlation only |
| `mode` | Yes | `validate` or `generate` |
| `userKey` | Recommended | Opaque user association for key + body (no raw email in keys). May also store a non-secret `userId` if distinct from the key segment |
| `status` | Yes | Terminal only: `completed` or `failed` |
| `createdAt` | Recommended | Run start / history-record creation time (ISO-8601) |
| `completedAt` | Recommended | Terminal timestamp; drives `{timestamp}` in the S3 key when available |
| `durationMs` | When available | `completedAt − createdAt` (or equivalent) |
| `platform` | When applicable | e.g. `x` · `instagram` · `facebook` |
| `contentType` | When applicable | Content-type enum used for the run |
| `guidelineVersion` | When available | Guideline version id/string applied |
| `model` | When available | Model id/name used |
| `provider` | When available | e.g. `openrouter` |
| `openRouterGenerationId` | When available | OpenRouter generation/request identifier for support and cost correlation |
| `promptTokens` | When available | Provider usage |
| `completionTokens` | When available | Provider usage |
| `totalTokens` | When available | Provider usage |
| `cost` | When available | Amount + currency or provider-reported cost fields — never store API keys |
| `validationOutcome` | When applicable | e.g. `pass` / `warning` / `fail` for validate mode |
| `error` | When failed | **Safe** error metadata only: stable code, short message, optional retryable flag — no secrets, no stack traces, no raw provider bodies |
| `historyKey` | When written | S3 object key under `workflow-runs/...` |
| `inputSummary` | Optional, minimized | See retention rules — **not** a license to store full prompts or uploads |

**Optional result summary (not full payload by default):** On `completed`, the history record may include a **small, redacted summary** of the outcome (e.g. `validationOutcome`, issue counts, approval recommendation) rather than the full `AiValidationResult` / `AiGenerationResult`. Storing full structured results in S3 is a product decision, not the default assumption for MVP audit metadata.

### What persistent history must **not** imply

Writing an `AiRunHistoryRecord` does **not** mean indefinitely storing:

- every full system/user prompt or model transcript
- raw uploaded images or base64 image payloads
- generated image binaries (unless a separate retention decision says so)
- provider API keys, auth tokens, or other secrets
- stack traces or raw provider error bodies
- arbitrary private user content beyond minimized, policy-approved fields

**`inputSnapshot` vs history:** Live `AiRun.inputSnapshot` exists so the workflow can resume, preserve input on failure, and authorize the caller. Persistent history should use at most an **`inputSummary`**: redacted/minimized fields (e.g. platform, content type, text length, image count, presence flags) — not a byte-for-byte copy of uploads or unbounded draft text — unless a later retention/privacy decision explicitly expands that scope. Never persist secrets in either place.

**Accessors (history):** `persistRunHistory(record: AiRunHistoryRecord)` · optional later `getRunHistory(runId)` / `listRunHistory(userKey)` — MVP may write-only; listing/search UI deferred.

**API routes:**

| Method | Route | Permission |
|--------|-------|------------|
| POST | `/api/admin/ai/validate` | `write_ai` (via `auth()` + `checkPermission` / equivalent helper; session identity only) |
| POST | `/api/admin/ai/generate` | `write_ai` (same pattern) |
| GET | `/api/admin/ai/runs/:runId` | `read_ai` + run ownership (session required; `runId` not a secret) |
| GET | `/api/admin/ai/guidelines` | `read_ai` |
| GET | `/api/admin/ai/guidelines/versions` | `read_ai` |
| POST | `/api/admin/ai/guidelines/drafts` | `write_ai` |
| PUT | `/api/admin/ai/guidelines/drafts/:id` | `write_ai` |
| POST | `/api/admin/ai/guidelines/:version/activate` | `write_ai` |
| POST | `/api/admin/ai/guidelines/:version/rollback` | `write_ai` |

---

## Permissions and security

AI uses the repository’s existing feature-based `ADMIN_PERMISSIONS` authorization model — the same system as members, payments, articles, guides, and media. Implementation must call the existing centralized helpers (`auth()`, `checkPermission` / `checkReadAccess` / `requirePermission`, `hasPermission`, session `accessibleFeatures`) rather than introducing a parallel permission parser or AI-only auth layer.

| Permission | Capabilities |
|------------|--------------|
| `read_ai` | View `/admin/ai` (read-only), guidelines, version history, run status/results (subject to ownership policy) |
| `write_ai` | All `read_ai` capabilities + start validation/generation workflows + manage guideline drafts/activation/rollback. Implies `read_ai` via the existing permission expander. |
| `read_*` / `write_*` | Existing admin wildcards in `lib/permissions.js`: `read_*` expands to all `read_<feature>` including `read_ai`; `write_*` expands to all write + read permissions including `write_ai` and `read_ai`. Describe and rely on this existing behavior only — do not invent a new wildcard implementation for AI. |

**Access rules:**

| Surface | Required permission | Enforcement |
|---------|---------------------|-------------|
| `/admin/ai` (page / tab) | `read_ai` | Server-side page gate (same pattern as other admin features) |
| Start validation or generation | `write_ai` | Server-side API routes (`POST .../validate`, `POST .../generate`) |
| Run status / result (`GET .../runs/:runId`) | `read_ai` + ownership/policy check | Server-side API route; `runId` alone is insufficient |
| Guideline read APIs | `read_ai` | Server-side API routes |
| Guideline write/activate/rollback APIs | `write_ai` | Server-side API routes |

**Identity and trust boundaries:**

- Server-side API routes enforce permissions on every request.
- Workflow user identity (`userId` / email used for ownership, rate limiting, and history keys) **must** be derived from the authenticated server-side session.
- **Never** trust a `userId` or email supplied by the client request body (ignore or reject if present; do not use for authz).
- `runId` is still **not** an authorization secret.
- Run status/result access must still authenticate the caller and enforce the applicable authorization/ownership policy.

Provider keys server-only. No member PII without SAC approval. Uploaded images not persisted or used for training. Generated images are drafts. Guideline changes logged. No exposed prompts/secrets/stack traces. Persistent `AiRunHistoryRecord` objects follow the same rule: no secrets, no stack traces, no indefinite storage of full prompts, raw uploads, or base64 payloads by default.

**Run access:** `runId` may appear in the client URL for refresh recovery. It is an opaque workflow identifier only — not a capability token, signed link, or substitute for session auth. Every `GET /api/admin/ai/runs/:runId` request must: (1) authenticate the caller via `auth()`, (2) enforce `read_ai` via centralized helpers, (3) verify the run belongs to the caller using session-derived identity vs workflow ownership metadata (or is otherwise allowed per policy), and (4) return `403`/`404` without leaking status, result, or error details when access is denied.

---

## Workflows

**Content review:** Submit → workflow starts (Vercel Workflows = live `AiRun`) → UI polls `GET .../runs/:runId` → on terminal state, workflow persists an `AiRunHistoryRecord` to S3 → user edits → re-validate → comms lead reviews → copy/download → publish manually. AI never publishes, schedules, or approves. The UI may persist `runId` in the URL so a refresh can resume polling; recovery still requires an authenticated session and server-side run ownership verification against Workflows. S3 history is for audit/persistence, not live polling.

**Guideline management (Phase 3):** View active → create draft → edit sections → validate structure → preview → activate → future runs use new active version. Prior published versions remain immutable in history. Rollback re-activates a prior version. All changes audited.

---

## Error handling

| Condition | Behavior |
|-----------|----------|
| Missing fields / bad uploads | Inline error; no workflow start |
| Unauthenticated / unauthorized | `401` / `403` |
| Provider failure | Step retries; then `failed` with recoverable error; input preserved; history record still written for the failed run when possible |
| Run not found / forbidden | `404` / `403` — no status, result, or error body when caller is unauthenticated or not allowed (including guessed or leaked `runId` in URL) |
| Malformed model output | Retry once; then safe failure |
| Guidelines unavailable | Warn; don't claim full compliance |
| Image generation unavailable | Return text draft + explanation |
| Run-history S3 write failure | Log error; do **not** fail or rewrite the workflow terminal status already returned to the client; live state remains authoritative in Workflows |

**Principle:** AI is advisory. Failures must not block manual comms workflow.

---

## QA

**Manual:** Permission gating via existing `ADMIN_PERMISSIONS` (`read_ai` tab access; `write_ai` to start workflows; `read_*` / `write_*` users inherit AI access per existing expander) · text/image validation E2E · generation E2E (Phase 2) · no auto-publish messaging · copy/download · upload limits · provider failure · session expiry · duplicate submit · workflow polling · interrupted run resume · URL `runId` refresh recovery (authenticated) · unauthenticated or cross-user `runId` access denied without leaking run details · client-supplied `userId`/email in request body ignored for ownership · `AiRunHistoryRecord` written to S3 on completed/failed · history objects omit secrets/full prompts/raw uploads by default · history write failure does not break client terminal status · S3 keys use opaque `userKey` (no raw email).

**Test cases — validation:** pass · warning (missing event) · fail (privacy, image PII, overconfident astronomy, length violation, image-caption mismatch, missing alt text, prompt injection).

**Test cases — generation:** single/multi-platform drafts · generated image · prompt-only fallback · missing date (no invention) · no approval claims · no unprovided visual facts.

**Automated:** Existing permission helpers (`hasPermission`, `checkPermission`, `checkReadAccess`) · AI routes use those helpers (no bespoke permission parsing) · route auth · `read_ai` / `write_ai` enforcement · run status auth + ownership checks (no `runId`-only access; session-derived identity) · reject/ignore client-body identity fields for authz · input validation · upload validation · output schema · image metadata · workflow start/status · terminal states · run-history key format (`workflow-runs/{userKey}/{YYYY}/{MM}/{DD}/{timestamp}-{runId}.json`) · `AiRunHistoryRecord` schema/version fields · history persistence on terminal state · history write failure isolation · history payload excludes secrets and does not require full `inputSnapshot`.

---

## Acceptance criteria

### Phase 1 — Validation

**1A — Backend + provider connection**
- [ ] `POST /api/admin/ai/validate` uses `auth()` + centralized permission helpers to enforce `write_ai`, validates input, starts Vercel Workflow with session-derived user identity → `{ runId, status }` (never trusts client-body `userId`/email)
- [ ] `GET /api/admin/ai/runs/:runId` uses `auth()` + helpers to enforce `read_ai`, verifies run ownership against session identity, then returns status/result/error; `runId` alone does not authorize access
- [ ] Validation workflow steps: payload/upload checks → load guidelines stub or defaults → model call → schema validation → `AiValidationResult`
- [ ] Schema-valid response with `humanReviewRequired: true`; transient provider failures retry at step level; malformed output retries once then fails safely
- [ ] Live run state in Vercel Workflows (polling source of truth); on terminal state, persist `AiRunHistoryRecord` to S3 under `workflow-runs/{userKey}/.../{timestamp}-{runId}.json` (sparse audit metadata — not full prompts/uploads); per-user rate limiting on workflow start (session identity)

**1B — Validation dashboard**
- [ ] `/admin/ai` requires `read_ai` via existing admin feature-gate patterns; starting validation requires `write_ai` (server-enforced)
- [ ] Validation form: platform, content type, draft text, optional image upload, validate button
- [ ] Workflow start + polling until complete/failed/timeout; loading, error, and result states; optional `runId` in URL for refresh recovery (still requires auth + ownership on every status fetch)
- [ ] Provider failure preserves user input; human review notice visible; no publish actions

**1C — Guideline-based validation**
- [ ] One platform at a time; X, Instagram, Facebook; Spanish default
- [ ] Image validation for `image_post`/`carousel`
- [ ] `getActiveGuidelines()` at request time; guideline version in audit/metadata
- [ ] Curated test set passes quality gates; astronomy flagged not verified
- [ ] Copy summary/issues/suggested revision; P95 <15s text / <30s image

### Phase 2 — Generation

**2A — Backend + provider connection**
- [ ] `POST /api/admin/ai/generate` uses `auth()` + centralized helpers to enforce `write_ai`, validates input, starts Vercel Workflow with session-derived identity → `{ runId, status }` (never trusts client-body `userId`/email)
- [ ] `GET /api/admin/ai/runs/:runId` supports generation runs (shared polling route with validation); same auth + ownership rules as validation — `runId` is not a secret; status/result access always authenticates and enforces authorization/ownership
- [ ] Generation workflow steps: payload validation → load guidelines → text generation → schema validation → `AiGenerationResult` (image steps added in 2D/2E)
- [ ] Schema-valid response with `humanReviewRequired: true`; safe failure with recoverable error; input preserved in workflow metadata
- [ ] Provider integration via OpenRouter in workflow steps; same retry/resume semantics as validation; terminal runs persist history to S3 (same key strategy as validation)

**2B — Generation dashboard**
- [ ] Generation workflow accessible from `/admin/ai` (extends validation dashboard from 1B); starting generation requires `write_ai`
- [ ] Generation form: intent, topic, platform(s), content type, tone, image style/constraints
- [ ] Workflow start + polling; loading, error, and result states
- [ ] Human review notice visible; no publish actions

**2C — Guideline-based text**
- [ ] `getActiveGuidelines()`; Spanish default; one draft per platform
- [ ] Assumptions, missing info, fact preservation; no invented details; no approval claims

**2D — Image prompts**
- [ ] `imagePrompt` + `imageRationale`; safety constraints; no unprovided facts or identifiable people

**2E — Image assets**
- [ ] Gated on provider config, rights, retention, spend ceiling
- [ ] Downloadable draft images; fallback to prompts on failure

### Phase 3 — Guideline management

- [ ] View active guidelines + version history; create/edit drafts via forms (global/platform/content-type)
- [ ] Preview, activate, rollback; exactly one active version at a time; published historical versions immutable; invalid configs rejected
- [ ] S3-backed versioned `guidelines-store` with draft/active separation, activation, rollback, and audit log; accessors: `getActiveGuidelines()`, `listGuidelineVersions()`, `createGuidelineDraft()`, `saveGuidelineDraft()`, `activateGuidelineVersion()`, `rollbackGuidelineVersion()`; no AWS/S3 in UI
- [ ] Platform/content-type selectors read from active config with MVP defaults fallback

### Technical (Phases 1–3)
- [ ] `app/api/admin/ai/*` with server-side `auth()` and existing `ADMIN_PERMISSIONS` helpers (`checkPermission` / `checkReadAccess` / etc.) — no second authorization system; no manual permission parsing in AI routes
- [ ] `/admin/ai` gated by `read_ai`; workflow starts gated by `write_ai`; session-derived identity for ownership/rate limits; client-supplied identity fields not trusted
- [ ] Vercel Workflows orchestration; schema validation in workflow
- [ ] Live `AiRun` state from Workflows; persistent `AiRunHistoryRecord` in S3 (`run-history-store`); opaque `userKey` in keys; no secrets in history objects; history write failures isolated; per-user rate limiting; audit logging

### MVP sign-off
- [ ] Validator E2E (text + images) · generator E2E · guideline management E2E (Phase 3) · copy/download · stakeholder acceptance of limitations

---

## Roadmap

**Implementation order:** backend and provider connection first (`1A`, `2A`), then dashboard UI (`1B`, `2B`), then guideline management (Phase 3).

| Phase | Goal | Key deliverables |
|-------|------|------------------|
| **0 — Alignment** | Stakeholder alignment, initial guidelines, provider config, Vercel Workflows setup, S3 prefixes for run history | No code |
| **1A** | Validation backend + provider | Validate API routes, Vercel Workflow, auth, polling, schema validation, S3 run-history persistence on terminal state |
| **1B** | Validation UI | `/admin/ai` validate form, loading/error/result states, human-review messaging |
| **1C** | Guideline-based validation | `getActiveGuidelines()`, validation categories, test set |
| **2A** | Generation backend + provider | Generate API routes, Vercel Workflow, polling, schema validation, S3 run-history persistence |
| **2B** | Generation UI | Generation form, workflow polling, result display, human-review messaging |
| **2C** | Guideline-based text generation | Platform drafts, guardrails |
| **2D** | Image prompts | Safe prompts with constraints |
| **2E** | Image assets | Provider abstraction, download, fallback |
| **3** | Guideline management | Versioned `guidelines-store` (S3): draft editing, one active version, immutable published history, activation, rollback, audit log, management UI |

**Future:** Generation→validation loop (2F) — generated text/images pre-fill validation form; editable before validate; never bypasses human review · RAG (style/tone, rights-gated) · video validation · searchable/analytics run history UI (likely DB; S3 remains MVP audit store) · publishing integrations (low priority).

---

## Decisions and review items

**Confirmed:** Admin/comms-only at `/admin/ai` · authorization via existing feature-based `ADMIN_PERMISSIONS` (`read_ai` / `write_ai`; reuse `auth()` + `lib/api-permissions.js` / `lib/permissions.js`; no second auth system) · `/admin/ai` requires `read_ai`; starting workflows requires `write_ai`; session-derived identity only (never trust client-body `userId`/email) · `runId` is not an authorization secret · Vercel Workflows from 1A (backend before UI: 1A→1B, 2A→2B, then Phase 3) · OpenRouter server-side · Vercel Workflows = live `AiRun` state · S3 = persistent `AiRunHistoryRecord` audit metadata + guidelines (Phase 3) · run-history key shape `workflow-runs/{userKey}/{YYYY}/{MM}/{DD}/{timestamp}-{runId}.json` · opaque `userKey` (no raw email in keys) · history fields optional/sparse; no secrets; no default indefinite storage of full prompts/raw uploads · guidelines as behavior layer · **guideline version control** (S3-backed; draft/active separation; one active version; immutable published historical versions; activation; rollback; audit log; accessors: `getActiveGuidelines()`, `listGuidelineVersions()`, `createGuidelineDraft()`, `saveGuidelineDraft()`, `activateGuidelineVersion()`, `rollbackGuidelineVersion()`) · full guideline management UI in Phase 3 · no auto-publish · human review always required.

**Stakeholder review:**

| Item | Decision needed |
|------|-----------------|
| Production permissions | Who gets `read_ai` / `write_ai` in `ADMIN_PERMISSIONS` (existing model; wildcards already cover AI when assigned) |
| Guideline activation | Who can activate versions (capability exists; role assignment TBD) |
| Spend ceiling | Monthly OpenRouter/image generation limit |
| Generated image retention | S3 temp, permanent, or download-only |
| Activation governance | Single editor or second reviewer (process only — versioning model is confirmed) |
| Initial guideline source | Draft from existing SAC posts? |
| Run-history retention | How long to keep S3 `AiRunHistoryRecord` objects; purge policy |
| History payload depth | Whether MVP stores only minimized `inputSummary` + outcome summary, or also redacted draft text / full structured results |
| `userKey` mapping | Prefer stable session/user id vs hashed identifier for S3 keys |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Vague guidelines | Phase 0 gate; AI states incomplete coverage |
| Invented facts (text/image) | Missing-info output; guardrails; manual re-validation |
| Provider cost | Rate limits; spend ceiling; usage logging |
| Users treat output as final | Draft labels; human review notice; no publish actions |
| Overconfident astronomy | Flag for review; no fact-checking claims |
| Permission leakage | Reuse existing `ADMIN_PERMISSIONS` helpers on every route/page; no parallel auth; `runId` in URL never substitutes for session auth |
| Spoofed client identity | Derive workflow `userId`/email only from authenticated session; ignore client-body identity fields |
| `runId` treated as secret | Document and enforce: URL recovery only; every status request authenticates, enforces `read_ai`, and verifies ownership/policy |
| Divergent AI auth | Do not manually parse permissions in AI routes; call `checkPermission` / `checkReadAccess` / `hasPermission` like other admin APIs |
| Provider/deploy failure | Workflow retries + resume; preserve input; persist failed-run history when possible |
| History write failure | Isolate from live status; log for ops; Workflows remain authoritative for polling |
| PII in S3 keys | Opaque `userKey` only; never put raw email in object keys |
| Over-retention in history | Default to sparse `AiRunHistoryRecord`; do not treat history as indefinite storage of full prompts, uploads, base64, secrets, or stack traces |
| Bad guideline edit | Draft/active separation; immutable published history; preview; rollback; audit log |
| Scope creep | Phases 1–3 committed; RAG/video/editing deferred; searchable history UI deferred (S3 audit only in MVP) |

---

## Appendix: example outputs

**Validation — warning:**
```json
{
  "overallOutcome": "warning",
  "approvalRecommendation": "needs_edits",
  "summary": "Friendly tone but missing event logistics.",
  "issues": [{ "severity": "major", "category": "completeness", "message": "Missing time, location, and registration details.", "suggestedFix": "Add time, location, and registration link.", "affectedPlatform": "facebook" }],
  "humanReviewRequired": true
}
```

**Generation — Instagram event (Phase 2):**
```json
{
  "platform": "instagram",
  "contentType": "event_promotion",
  "draftText": "Este sábado, acompáñanos a mirar el cielo nocturno con SAC...",
  "imagePrompt": "Family-friendly astronomy outreach in Puerto Rico; no identifiable faces, no text, no official logo.",
  "generatedImages": [{ "assetId": "generated-image-001", "status": "draft", "rationale": "Supports event promotion without inventing details." }],
  "missingInformation": [],
  "recommendedNextStep": "Validate generated text and image before approval.",
  "humanReviewRequired": true
}
```
