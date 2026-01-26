# Codebase Concerns

**Analysis Date:** 2026-01-26

## Tech Debt

**Deprecated AWS SDK in use:**
- Issue: Using `aws-sdk` (v2) which is in maintenance mode. AWS recommends migration to `@aws-sdk/client-s3` (v3) with modular architecture
- Files: `pages/api/photos.js`, `pages/api/get-years.js`
- Impact: Missing security patches, performance optimizations, and modern error handling. Bundle size increases due to legacy SDK including all services
- Fix approach: Migrate to AWS SDK v3 by replacing `import AWS from 'aws-sdk'` with `import { S3Client, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3"`. Update API handlers to use promise-based command pattern

**Next.js 12 nearing end-of-life:**
- Issue: Project uses Next.js ^12.1.0. Next.js 12 reached EOL in October 2023
- Files: `package.json`, `next.config.js`
- Impact: No security updates, missing performance improvements from versions 13+, TypeScript support degraded, image optimization limitations
- Fix approach: Plan upgrade to Next.js 14+ in phases. Update package.json, migrate dynamic imports, update API routes to App Router

**Preact in production without proper testing:**
- Issue: Production builds use Preact aliasing for React (`next.config.js` lines 31-36), but no tests verify compatibility
- Files: `next.config.js`, `test/` directory
- Impact: Preact compatibility gaps only discovered in production. Certain React APIs may fail with Preact
- Fix approach: Run full test suite before deploying to ensure Preact compatibility. Add CI check that blocks builds with failing tests

**Node-cache with no expiration validation:**
- Issue: In `pages/api/apod.js`, NASA APOD cache uses 6-hour TTL but no fallback if cache.getTtl() check fails
- Files: `pages/api/apod.js` (lines 31-37)
- Impact: If cache expires during request, `cache.get()` returns null and code crashes on `extractImgSrc(latest.description)` at line 48
- Fix approach: Add null check after cache.get(): `if (!latest) { const latest = await getLatestImage(); }`

## Known Bugs

**APOD API regex fragility:**
- Symptoms: 404 errors when NASA APOD HTML structure changes
- Files: `pages/api/apod.js` (lines 41-50)
- Trigger: NASA updates APOD RSS feed HTML format (e.g., img src URL pattern or alt attribute location changes)
- Workaround: Manually trigger rebuild. Fix NASA feed pattern in regex when it breaks
- Root cause: Hard-coded regex patterns depend on exact HTML structure. No fallback to RSS image/description tags

**Null reference in APOD extraction:**
- Symptoms: 500 error: "Cannot read property '[1]' of null"
- Files: `pages/api/apod.js` (line 48)
- Trigger: When extractImgSrc regex doesn't match (`string.match()` returns null), code tries to access `[1]` property
- Workaround: Wait for next manual cache refresh
- Root cause: No null safety on regex match result

**Missing null checks in gallery S3 metadata:**
- Symptoms: Gallery images display without proper metadata when S3 object metadata is missing
- Files: `pages/api/photos.js` (lines 39-44)
- Trigger: Photos uploaded without required metadata tags
- Impact: Creates inconsistent gallery display (empty titles/descriptions for some images)

**Google Apps Script in maintenance mode:**
- Symptoms: All test functions disabled by MAINTENANCE_MODE constant
- Files: `appsscript/CreateUser.js` (line 1)
- Impact: Cannot verify membership processing workflows without disabling maintenance mode and risking production
- Fix approach: Create separate test spreadsheet or implement feature flag system

## Security Considerations

**Environment variables accessed without validation:**
- Risk: If critical env vars are missing (AWS_S3_ENDPOINT, MAILCHIMP_API_KEY, etc.), errors expose incomplete configuration
- Files: `pages/api/photos.js`, `pages/api/mailchimp.js`, `pages/api/convertkit.js`, `pages/api/buttondown.js`
- Current mitigation: Basic try-catch returns generic 500 error
- Recommendations:
  1. Add startup validation in `next.config.js` or API initialization to fail early if required env vars missing
  2. Create `.env.validation.js` that checks all required variables at build time
  3. Log validation errors to external service (not console) to avoid exposing config issues

**API error messages leak implementation details:**
- Risk: Error responses could expose internal service names or AWS bucket details
- Files: `pages/api/mailchimp.js` (line 23), `pages/api/convertkit.js` (line 20)
- Current mitigation: None - errors are passed directly to response
- Recommendations:
  1. Create standardized error handler that logs full error server-side but returns generic message to client
  2. Add error logging to external service (Sentry, LogRocket) for debugging without exposing to users

**Newsletter API endpoints accept any email without CORS:**
- Risk: POST endpoints at `/api/mailchimp`, `/api/buttondown`, `/api/convertkit` have no rate limiting or CSRF protection
- Files: `pages/api/mailchimp.js`, `pages/api/buttondown.js`, `pages/api/convertkit.js`
- Current mitigation: None
- Recommendations:
  1. Add rate limiting middleware (e.g., `redis` + custom middleware or `next-rate-limit`)
  2. Validate request origin or implement CSRF token validation
  3. Add email validation (not just required field check)

**AWS credentials in plaintext environment variables:**
- Risk: If `.env` is accidentally committed or deployed insecurely, AWS credentials are exposed
- Files: `.env.template` (commented out), CI/CD configuration (unknown)
- Current mitigation: .env is in .gitignore (assumed)
- Recommendations:
  1. Verify `.env` is in `.gitignore` - confirm in git status
  2. Use AWS IAM roles instead of static credentials in production
  3. For development, use AWS SSO with credential expiration

**Giscus API key visible in siteMetadata:**
- Risk: GitHub repository and category IDs are NEXT_PUBLIC variables (intentional for Giscus), but if GitHub repo becomes private later, potential exposure
- Files: `data/siteMetadata.js` (lines 52-55)
- Current mitigation: These are meant to be public for Giscus to function
- Recommendations: Monitor GitHub repository permissions; if it becomes private, Giscus will stop working (expected behavior)

## Performance Bottlenecks

**S3 gallery API makes parallel headObject calls without connection pooling:**
- Problem: Every image fetch calls `s3.headObject()` in Promise.all() (50+ images = 50+ concurrent connections)
- Files: `pages/api/photos.js` (lines 36-51)
- Cause: AWS SDK v2 doesn't reuse connections efficiently for many concurrent requests
- Improvement path:
  1. Add pagination: Only fetch metadata for visible images (lazy load)
  2. Batch headObject calls with delays to limit concurrency (max 10 concurrent)
  3. Cache metadata in application memory or Redis
  4. Use AWS SDK v3 which handles connection pooling better

**MDX bundling with esbuild happens at build time but ESBUILD_BINARY_PATH set at request time:**
- Problem: Per-request environment variable setup adds overhead
- Files: `lib/mdx.js` (lines 48-63)
- Cause: Windows compatibility check should be done once at module load, not per-file
- Improvement path: Move ESBUILD_BINARY_PATH setup to module-level initialization or build configuration

**No image optimization for S3 gallery images:**
- Problem: Full resolution images served from S3 signed URLs (lines 45-49 in photos.js)
- Files: `pages/api/photos.js`, `components/GalleryImageModal.js`
- Impact: Slow page loads on mobile, high bandwidth usage
- Improvement path:
  1. Add image resizing layer (CloudFront + Lambda@Edge or Next.js Image Optimization)
  2. Generate thumbnail sizes in S3 on upload
  3. Use Next.js Image component with next/image for optimization

**Recursive file scanning for blog posts has no caching:**
- Problem: `getAllFilesFrontMatter()` reads and parses every post file at build time (fine for 50 posts, problematic at 1000+)
- Files: `lib/mdx.js` (lines 114-140), `lib/utils/files.js`
- Impact: Build time increases linearly with post count
- Improvement path:
  1. Implement incremental static regeneration (ISR) to rebuild only changed posts
  2. Cache frontmatter metadata in JSON file at build time
  3. Consider splitting blog into sections (yearly archives) with separate build artifacts

## Fragile Areas

**APOD API completely dependent on third-party RSS structure:**
- Files: `pages/api/apod.js`
- Why fragile: Hard-coded regex patterns (lines 41, 47) with no fallback mechanism. NASA APOD RSS is only data source
- Safe modification:
  1. Add multiple extraction methods (try regex, then fallback to HTML parser, then fallback to cached value)
  2. Monitor NASA APOD feed for structure changes (e.g., with integration tests)
  3. Add circuit breaker: if 3 consecutive failures, return cached/default image
- Test coverage: Missing - APOD API has no tests

**Google Apps Script membership workflow:**
- Files: `appsscript/CreateUser.js` (3537 lines - largest file)
- Why fragile: Complex state machine with multiple sheets (RAW, CLEAN, PAYMENTS). TODO at line 1952 acknowledges incomplete payment handling. MAINTENANCE_MODE disables all verification
- Safe modification:
  1. Add comprehensive logging at each state transition
  2. Create test spreadsheet before deploying any changes
  3. Run test functions (test_userEditsPAYMENTS, test_paymentScanRuns) to verify workflows
  4. Add rollback strategy: keep backup of previous sheet state
- Test coverage: Test functions exist but disabled by MAINTENANCE_MODE

**Gallery year/month extraction from S3 key structure:**
- Files: `pages/gallery.js` (lines 46-68)
- Why fragile: Assumes exact S3 key format (YYYY/MM/DD). If photo naming changes, all gallery display breaks
- Safe modification:
  1. Store year/month in S3 metadata instead of deriving from key
  2. Add validation that parsed year/month are valid integers
  3. Add error UI if date parsing fails (don't silently ignore)
- Test coverage: Tests exist (`test/galleryPage/gallery.test.js`) but don't cover all edge cases

**Newsletter provider abstraction incomplete:**
- Files: `pages/api/mailchimp.js`, `pages/api/buttondown.js`, `pages/api/convertkit.js`, `data/siteMetadata.js`
- Why fragile: Each provider has different error handling and response format. Switching providers requires code changes in multiple files
- Safe modification:
  1. Create `lib/newsletter/index.js` that exports `subscribeEmail()` function
  2. Each provider gets own module: `lib/newsletter/mailchimp.js`, `lib/newsletter/buttondown.js`, etc
  3. API endpoint becomes: `const result = await newsletterClient.subscribe(email)`
- Test coverage: No tests for newsletter API endpoints

**MemberIdBuilder component uses unvalidated camera/file input:**
- Files: `pages/id.js` (lines 31-85)
- Why fragile: FileReader and getUserMedia APIs can fail silently or display generic alerts
- Safe modification:
  1. Add specific error handling for different failure types (permission denied, device not found, unsupported browser)
  2. Validate image dimensions before generating ID card
  3. Add preview of photo before generation
- Test coverage: No tests for MemberIdBuilder

## Scaling Limits

**S3 ListObjectsV2 pagination not implemented:**
- Current capacity: Works for <1000 objects per folder (AWS default limit)
- Limit: Breaks when gallery has >1000 images in single year
- Scaling path:
  1. Implement ContinuationToken pagination in `pages/api/photos.js`
  2. Either fetch all paginated results at once or implement cursor-based pagination for client

**Node.js memory usage for large image galleries:**
- Current capacity: ~50 images fetched with metadata in single API call
- Limit: 500+ concurrent image fetches could exhaust server memory
- Scaling path:
  1. Implement streaming response or pagination
  2. Add request size limits in next.config.js
  3. Use Redis to cache gallery metadata

**Blog post build time with current glob pattern:**
- Current capacity: Tested with ~50 posts, builds in <30 seconds
- Limit: With 500+ posts across many years, build time approaches 5+ minutes
- Scaling path:
  1. Implement ISR (Incremental Static Regeneration) to rebuild only changed posts
  2. Split blog by year/category with separate build artifacts
  3. Pre-generate JSON index of posts instead of scanning files every build

## Dependencies at Risk

**aws-sdk v2 in maintenance mode:**
- Risk: No new features, security patches eventually discontinued
- Impact: All S3-dependent features degrade over time
- Migration plan: Replace with `@aws-sdk/client-s3` v3. Cost: 2-4 hours refactoring

**react ^17.0.2 and preact aliasing mismatch:**
- Risk: React 17 is stable but Preact 10 compatibility not guaranteed
- Impact: Production build could fail or behave unexpectedly with Preact
- Migration plan: Upgrade to React 18+ and test Preact compatibility thoroughly, or remove Preact optimization

**next-remote-watch dependency maintenance:**
- Risk: Package shows no recent updates, used for Prose.io integration
- Impact: Hot reload for content editing may break with future Node versions
- Migration plan: Consider removing if Prose.io is not actively used, or switch to native Next.js file watching

**older babel-jest (v30.0.4):**
- Risk: Version number suggests pre-release or migration issues
- Impact: Test stability uncertain
- Migration plan: Pin to stable babel-jest version (e.g., ^29.0.0)

## Missing Critical Features

**No authentication for API endpoints:**
- Problem: `/api/photos`, `/api/apod`, newsletter endpoints have no rate limiting or auth
- Blocks: Using gallery in production-scale deployments where API abuse possible

**No image upload validation:**
- Problem: Gallery relies on manual S3 upload with no validation of image format/size
- Blocks: Automated photo import/processing workflows

**No monitoring or alerting:**
- Problem: Errors logged to console only, no tracking of API failures
- Blocks: Knowing when gallery/newsletter features fail in production

**No admin dashboard for managing gallery/members:**
- Problem: Must edit Google Sheets directly for membership, manually upload photos to S3
- Blocks: Non-technical staff managing content

## Test Coverage Gaps

**API endpoints completely untested:**
- What's not tested: `/api/photos`, `/api/apod`, `/api/mailchimp`, `/api/buttondown`, `/api/convertkit`, `/api/get-years`
- Files: `pages/api/*.js`
- Risk: Endpoint failures only discovered in production
- Priority: High - critical to business (newsletter signup, photo gallery)

**Newsletter Form integration untested:**
- What's not tested: NewsletterForm component error handling, different provider responses
- Files: `components/NewsletterForm.js`
- Risk: Failed newsletter signups go unnoticed
- Priority: High - directly affects member engagement

**MDX build process integration untested:**
- What's not tested: Blog post compilation, frontmatter parsing, code block rendering
- Files: `lib/mdx.js`, `lib/remark-*.js`, `lib/utils/*.js`
- Risk: Blog posts fail to build without visibility
- Priority: High - blocks site deployment

**Google Apps Script workflows untested in production:**
- What's not tested: Membership creation flow, payment processing, email notifications
- Files: `appsscript/CreateUser.js` (entire file)
- Risk: Membership system failures only discovered when members complain
- Priority: Critical - revenue-impacting functionality

**Gallery components have partial coverage:**
- What's tested: Card, GalleryGrid, GalleryFilters, GalleryImageModal, photo utilities
- What's missing: Integration tests for full gallery flow (fetch → filter → display → zoom)
- Files: `test/galleryPage/`, `components/Gallery*.js`
- Risk: Gallery regressions slip through
- Priority: Medium - has test structure but missing integration tests

---

*Concerns audit: 2026-01-26*
