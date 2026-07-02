# AI Social Media Designer

**Type:** PRD · **Audience:** Engineering · **Status:** Draft

---

## Scope commitment

| Item | MVP decision |
|------|----------------|
| **Audience** | Admin and authorized comms users only (`/admin/ai`). No member-facing access. |
| **MVP scope** | **Phase 1:** Validation (text + images). **Phase 2:** Generation (text + images). **Phase 3:** Guideline management. |
| **Publishing** | None. Users copy/download outputs and publish manually. |
| **RAG / video** | Future phases. |
| **Generation→validation loop** | Future phase (post-MVP). Users copy/download and validate manually in MVP. |
| **Guidelines UI** | Phase 3 — comms users maintain active guidelines in dashboard. |
| **Orchestration** | Vercel Workflows from Phase 1A (backend); validation UI in 1B; generation UI in 2B; guidelines UI in Phase 3. |
| **Storage** | S3 only for guidelines (Phase 3). Run state in Vercel Workflows — no DB or S3 for `AiRun`. |

---

## Summary

AI-assisted admin dashboard for SAC communications: **validate** proposed posts and **generate** drafts for X, Instagram, and Facebook. Guideline-driven, human-in-the-loop. Validation and generation run as durable Vercel Workflows; S3 backs guidelines only. Spanish-first. AI never publishes or approves content.

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

- Tab at `/admin/ai`; `read_ai` to view, `write_ai` to run workflows.
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
- Audit via server logs + workflow metadata.

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

Guidelines are the editable layer between comms stakeholders and AI workflows. Phase 3: S3-backed versioned JSON via `guidelines-store` (reuse SAC's existing S3 pattern). Comms users edit via dashboard forms — not GitHub, raw JSON, or S3 directly.

| Scope | Examples |
|-------|----------|
| **Global** | SAC voice, Spanish-first, privacy, safety, factual caution, accessibility |
| **Platform** | Character limits, tone, hashtags, media requirements |
| **Content-type** | Required fields, missing-info checks, structure, severity defaults |

**Phase 3 UI:** Active overview · draft from active version · section editing · preview against sample post · activation · version history · rollback · audit log. One active version at a time. Backend validates before save/activation. UI hides AWS/S3 terminology.

**Accessors:** `getActiveGuidelines()` · `listGuidelineVersions()` · `createGuidelineDraft()` · `saveGuidelineDraft()` · `activateGuidelineVersion()` · `rollbackGuidelineVersion()`

**Gate:** Phase 0 seeds initial guidelines; Phases 1–2 consume them via `getActiveGuidelines()` (stub/defaults until Phase 3 ships). Phase 3 manages draft and active versions.

---

## Technical architecture

| Layer | Choice |
|-------|--------|
| **UI** | `app/admin/ai/*` |
| **API** | `app/api/admin/ai/*` — `auth()` + permissions |
| **Orchestration** | Vercel Workflows (`'use workflow'` + `'use step'`) |
| **AI** | OpenRouter via Vercel AI SDK (or equivalent) in workflow steps |
| **Guidelines** | `guidelines-store` → S3 (Phase 3 only mandatory S3 use) |
| **Run state** | Vercel Workflows — no separate DB/S3 for `AiRun` |
| **Uploads** | Server-side; MIME/size/count limits; not persisted to S3 |
| **Generated images** | Retention TBD (stakeholder review); gated on usage rights + spend ceiling |
| **Rate limiting** | Per-user workflow start cap |
| **Production** | Remove dev-only `NODE_ENV` gating before launch |

### API pattern

- `POST /api/admin/ai/validate` · `POST /api/admin/ai/generate` → authenticate, validate, start workflow, return `{ runId, status }`
- `GET /api/admin/ai/runs/:runId` → authenticate (`read_ai`), verify the caller is allowed to access that run (ownership check against workflow input metadata `userId`), then return status/result/error from Vercel Workflows. **`runId` is not an authorization secret** — knowing a `runId` alone must not grant access.
- UI may store `runId` in the URL (query or path) for refresh recovery; every poll and page load still calls the authenticated status route above.
- UI polls until complete/failed/timeout; preserves input on failure

### Workflow steps

**Validation:** (1) validate payload/uploads (2) load guidelines (3) call model (4) validate schema (5) return `AiValidationResult`

**Generation:** (1) validate payload (2) load guidelines (3) generate text (4) generate image prompt(s) (5) generate image asset(s) (6) validate output (7) return `AiGenerationResult`

**Retries:** Transient failures at step level; malformed output retries once then fails safely. Runs survive deploys/crashes.

### Storage boundaries

| Data | Storage | MVP? |
|------|---------|------|
| Run state, step results | Vercel Workflows | Yes |
| Guidelines | S3 via `guidelines-store` | Yes (Phase 3) |
| Uploaded validation images | Workflow payload | Yes — no S3 |
| Generated images | Stakeholder decision | TBD |
| Cross-run history/analytics | Database | No |

### Future

Generation→validation loop (2F): pre-fill validation from generated text/images; editable before validate; never bypasses human review. Neon/pgvector for RAG and run history. RAG deferred until SAC confirms rights to historical posts — style/tone reference only, not factual verification.

---

## Data model and APIs

**Entities:** `AiRun` · `AiValidationResult` · `AiGenerationResult` · `AiDraftVariant` · `AiGeneratedImage` · `AiIssue` · `AiImageInput` · `AiGuideline` · `AiGuidelineVersion` · `AiGuidelineDraft` · `AiGuidelineAuditEvent` · `AiGuidelineActivation`

**`AiRun`** — product/API view of a workflow execution (not a separate store):

| Field | Source |
|-------|--------|
| `id` / `runId` | Vercel Workflows run id |
| `mode` | `validate` or `generate` |
| `status` | `queued` · `running` · `completed` · `failed` |
| `userId` | Workflow input metadata — used for run ownership verification on every status request |
| `inputSnapshot` | Request payload |
| `guidelineVersion` | Active version used |
| `result` | `AiValidationResult` or `AiGenerationResult` |
| `error` | Safe message when failed |

**API routes:**

| Method | Route | Permission |
|--------|-------|------------|
| POST | `/api/admin/ai/validate` | `write_ai` |
| POST | `/api/admin/ai/generate` | `write_ai` |
| GET | `/api/admin/ai/runs/:runId` | `read_ai` + run ownership (session required; `runId` not a secret) |
| GET | `/api/admin/ai/guidelines` | `read_ai` |
| GET | `/api/admin/ai/guidelines/versions` | `read_ai` |
| POST | `/api/admin/ai/guidelines/drafts` | `write_ai` |
| PUT | `/api/admin/ai/guidelines/drafts/:id` | `write_ai` |
| POST | `/api/admin/ai/guidelines/:version/activate` | `write_ai` |
| POST | `/api/admin/ai/guidelines/:version/rollback` | `write_ai` |

---

## Permissions and security

| Permission | Capabilities |
|------------|--------------|
| `read_ai` | View tab, guidelines, version history, run status/results |
| `write_ai` | All read capabilities + start workflows + manage guideline drafts/activation/rollback |

Server-side auth on every route. Provider keys server-only. No member PII without SAC approval. Uploaded images not persisted or used for training. Generated images are drafts. Guideline changes logged. No exposed prompts/secrets/stack traces.

**Run access:** `runId` may appear in the client URL for refresh recovery. It is an opaque workflow identifier only — not a capability token, signed link, or substitute for session auth. Every `GET /api/admin/ai/runs/:runId` request must: (1) authenticate the caller, (2) enforce `read_ai`, (3) verify the run belongs to the caller (or is otherwise allowed per policy), and (4) return `403`/`404` without leaking status, result, or error details when access is denied.

---

## Workflows

**Content review:** Submit → workflow starts → poll results → edit → re-validate → comms lead reviews → copy/download → publish manually. AI never publishes, schedules, or approves. The UI may persist `runId` in the URL so a refresh can resume polling; recovery still requires an authenticated session and server-side run ownership verification.

**Guideline management:** View active → create draft → edit sections → validate structure → preview → activate → future runs use new version. Rollback available.

---

## Error handling

| Condition | Behavior |
|-----------|----------|
| Missing fields / bad uploads | Inline error; no workflow start |
| Unauthenticated / unauthorized | `401` / `403` |
| Provider failure | Step retries; then `failed` with recoverable error; input preserved |
| Run not found / forbidden | `404` / `403` — no status, result, or error body when caller is unauthenticated or not allowed (including guessed or leaked `runId` in URL) |
| Malformed model output | Retry once; then safe failure |
| Guidelines unavailable | Warn; don't claim full compliance |
| Image generation unavailable | Return text draft + explanation |

**Principle:** AI is advisory. Failures must not block manual comms workflow.

---

## QA

**Manual:** Permission gating · text/image validation E2E · generation E2E (Phase 2) · no auto-publish messaging · copy/download · upload limits · provider failure · session expiry · duplicate submit · workflow polling · interrupted run resume · URL `runId` refresh recovery (authenticated) · unauthenticated or cross-user `runId` access denied without leaking run details.

**Test cases — validation:** pass · warning (missing event) · fail (privacy, image PII, overconfident astronomy, length violation, image-caption mismatch, missing alt text, prompt injection).

**Test cases — generation:** single/multi-platform drafts · generated image · prompt-only fallback · missing date (no invention) · no approval claims · no unprovided visual facts.

**Automated:** Permission helpers · route auth · run status auth + ownership checks (no `runId`-only access) · input validation · upload validation · output schema · image metadata · workflow start/status · terminal states.

---

## Acceptance criteria

### Phase 1 — Validation

**1A — Backend + provider connection**
- [ ] `POST /api/admin/ai/validate` authenticates (`write_ai`), validates input, starts Vercel Workflow → `{ runId, status }`
- [ ] `GET /api/admin/ai/runs/:runId` authenticates (`read_ai`), verifies run ownership, then returns status/result/error; `runId` alone does not authorize access
- [ ] Validation workflow steps: payload/upload checks → load guidelines stub or defaults → model call → schema validation → `AiValidationResult`
- [ ] Schema-valid response with `humanReviewRequired: true`; transient provider failures retry at step level; malformed output retries once then fails safely
- [ ] Run state in Vercel Workflows only — no separate DB/S3 for `AiRun`; per-user rate limiting on workflow start

**1B — Validation dashboard**
- [ ] `/admin/ai` tab gated by `read_ai`; validation actions require `write_ai`
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
- [ ] `POST /api/admin/ai/generate` authenticates (`write_ai`), validates input, starts Vercel Workflow → `{ runId, status }`
- [ ] `GET /api/admin/ai/runs/:runId` supports generation runs (shared polling route with validation); same auth + ownership rules as validation — `runId` is not a secret
- [ ] Generation workflow steps: payload validation → load guidelines → text generation → schema validation → `AiGenerationResult` (image steps added in 2D/2E)
- [ ] Schema-valid response with `humanReviewRequired: true`; safe failure with recoverable error; input preserved in workflow metadata
- [ ] Provider integration via OpenRouter in workflow steps; same retry/resume semantics as validation

**2B — Generation dashboard**
- [ ] Generation workflow accessible from `/admin/ai` (extends validation dashboard from 1B)
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
- [ ] Preview, activate, rollback; one active version; invalid configs rejected
- [ ] S3-backed `guidelines-store`; changes logged; no AWS/S3 in UI
- [ ] Platform/content-type selectors read from active config with MVP defaults fallback

### Technical (Phases 1–3)
- [ ] `app/api/admin/ai/*` with server-side auth
- [ ] Vercel Workflows orchestration; schema validation in workflow
- [ ] No separate DB/S3 for `AiRun`; per-user rate limiting; audit logging

### MVP sign-off
- [ ] Validator E2E (text + images) · generator E2E · guideline management E2E (Phase 3) · copy/download · stakeholder acceptance of limitations

---

## Roadmap

**Implementation order:** backend and provider connection first (`1A`, `2A`), then dashboard UI (`1B`, `2B`), then guideline management (Phase 3).

| Phase | Goal | Key deliverables |
|-------|------|------------------|
| **0 — Alignment** | Stakeholder alignment, initial guidelines, provider config, Vercel Workflows setup | No code |
| **1A** | Validation backend + provider | Validate API routes, Vercel Workflow, auth, polling, schema validation |
| **1B** | Validation UI | `/admin/ai` validate form, loading/error/result states, human-review messaging |
| **1C** | Guideline-based validation | `getActiveGuidelines()`, validation categories, test set |
| **2A** | Generation backend + provider | Generate API routes, Vercel Workflow, polling, schema validation |
| **2B** | Generation UI | Generation form, workflow polling, result display, human-review messaging |
| **2C** | Guideline-based text generation | Platform drafts, guardrails |
| **2D** | Image prompts | Safe prompts with constraints |
| **2E** | Image assets | Provider abstraction, download, fallback |
| **3** | Guideline management | `guidelines-store`, S3, draft/active/rollback UI |

**Future:** Generation→validation loop (2F) — generated text/images pre-fill validation form; editable before validate; never bypasses human review · RAG (style/tone, rights-gated) · video validation · analytics/run history (requires DB) · publishing integrations (low priority).

---

## Decisions and review items

**Confirmed:** Admin/comms-only at `/admin/ai` · Vercel Workflows from 1A (backend before UI: 1A→1B, 2A→2B, then Phase 3) · OpenRouter server-side · S3 only for guidelines (Phase 3) · guidelines as behavior layer · no auto-publish · human review always required.

**Stakeholder review:**

| Item | Decision needed |
|------|-----------------|
| Production permissions | Who gets `read_ai` / `write_ai` |
| Guideline activation | Who can activate versions |
| Spend ceiling | Monthly OpenRouter/image generation limit |
| Generated image retention | S3 temp, permanent, or download-only |
| Activation governance | Single editor or second reviewer |
| Initial guideline source | Draft from existing SAC posts? |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Vague guidelines | Phase 0 gate; AI states incomplete coverage |
| Invented facts (text/image) | Missing-info output; guardrails; manual re-validation |
| Provider cost | Rate limits; spend ceiling; usage logging |
| Users treat output as final | Draft labels; human review notice; no publish actions |
| Overconfident astronomy | Flag for review; no fact-checking claims |
| Permission leakage | Server-side checks on every route; `runId` in URL never substitutes for auth |
| `runId` treated as secret | Document and enforce: URL recovery only; every status request authenticates and verifies run ownership |
| Provider/deploy failure | Workflow retries + resume; preserve input |
| Bad guideline edit | Draft/active separation; preview; rollback |
| Scope creep | Phases 1–3 committed; RAG/video/editing deferred |

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
