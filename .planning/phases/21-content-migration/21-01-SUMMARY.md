---
phase: 21-content-migration
plan: 01
subsystem: infra
tags: [aws-sdk, s3, migration, gray-matter, blog-content, images]

# Dependency graph
requires:
  - phase: 19-s3-article-data-layer
    provides: "putArticleJSON, putArticleIndex, S3_ARTICLES_BUCKET_NAME, article JSON shape"
provides:
  - "scripts/migrate-blog-to-s3.js: Complete migration script with dry-run and live modes for 77 posts and 215 images"
  - "S3_IMAGES_BUCKET_NAME env var for public blog images bucket"
affects: [21-content-migration-plan-02, 22-article-manager-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [filesystem-slug-preservation, two-phase-migration, bulk-index-build, image-url-encoding]

key-files:
  created:
    - scripts/migrate-blog-to-s3.js
  modified:
    - .env.template

key-decisions:
  - "Filesystem slug preservation (not regenerated from title) to maintain existing blog URLs"
  - "Two-phase migration: images first, then articles, to ensure all image URLs are valid"
  - "Bulk index build at end instead of incremental per-article (avoids 77 read-modify-write cycles)"
  - "Direct S3 putObject for both images and articles (no ESM imports from lib/articles-s3.js)"
  - "URL encoding per path segment for images with spaces in filenames (28 files)"

patterns-established:
  - "Filesystem slug derivation: path.relative(BLOG_ROOT, filePath) minus extension"
  - "Four image reference patterns handled: JSX single/double quotes, JSX expressions, markdown syntax"
  - "Promise pool concurrency pattern for parallel S3 uploads (limit 10)"
  - "JSONL migration log format for audit trail"

# Metrics
duration: 3min
completed: 2026-02-13
---

# Phase 21 Plan 01: Migration Script Summary

**Node.js migration script with dry-run/live modes that discovers 77 MDX posts and 215 images, validates frontmatter, rewrites 4 image reference patterns to S3 URLs, and uploads to separate articles/images buckets**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T18:11:05Z
- **Completed:** 2026-02-13T18:14:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Complete migration script handling all 77 blog posts (63 published, 13 drafts, 1 archived) and 215 images (~133 MB)
- Dry-run mode validates all frontmatter fields and verifies all image references without S3 credentials
- Four image reference patterns rewritten: `src={'/path'}` (149), `src="/path"` (15), `src={"/path"}` (1), `![alt](/path)` (0)
- URL encoding handles 28 images with spaces in filenames
- JSONL log file with 295 entries per run for audit trail

## Task Commits

Each task was committed atomically:

1. **Task 1: Create complete migration script** - `a34f09a` (feat)
2. **Task 2: Add S3_IMAGES_BUCKET_NAME to env template** - `421f1c5` (chore)

## Files Created/Modified
- `scripts/migrate-blog-to-s3.js` - Complete migration script: discovery, image upload, article processing, index build, logging, spot-check list
- `.env.template` - Added S3_IMAGES_BUCKET_NAME for public blog images bucket

## Decisions Made
- Used filesystem path as slug (not generateSlug from lib/articles.js) to preserve existing blog URLs
- Inline S3 putObject calls instead of importing ESM lib/articles-s3.js (CommonJS script cannot import ESM)
- Separate S3 clients for images (no custom endpoint) and articles (respects AWS_S3_ENDPOINT for localstack)
- Non-blog image references (canada, ocean, telescope_color.png) left unchanged in content
- Example posts included in migration (all drafts, per CONTEXT decision to migrate everything)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**Before running live migration:**
- `S3_IMAGES_BUCKET_NAME` env var must be set to a public S3 bucket name
- The images bucket must be created in AWS Console with public read access
- Existing AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) are reused

## Next Phase Readiness
- Migration script ready for live execution in Plan 21-02
- Run `node scripts/migrate-blog-to-s3.js --dry-run` to preview before live migration
- Plan 21-02 will handle running the live migration and post-migration archival

## Self-Check: PASSED

- [x] scripts/migrate-blog-to-s3.js exists
- [x] .env.template contains S3_IMAGES_BUCKET_NAME
- [x] Commit a34f09a found
- [x] Commit 421f1c5 found
- [x] Dry-run discovers 77 posts and 215 images
- [x] Dry-run validates all frontmatter without errors
- [x] Dry-run verifies all image references without errors
- [x] Log file created during dry-run
- [x] Spot-check list displayed

---
*Phase: 21-content-migration*
*Completed: 2026-02-13*
