# External Integrations

**Analysis Date:** 2026-01-26

## APIs & External Services

**Astronomy:**
- NASA Astronomy Picture of the Day (APOD)
  - What it's used for: Display daily astronomy image on homepage/pages
  - Integration: `pages/api/apod.js`
  - Method: RSS feed parsing (`https://apod.nasa.gov/apod.rss`)
  - SDK/Client: `rss-to-json` package
  - Caching: In-memory 6-hour TTL via `node-cache`

**Newsletter Services (Multi-provider):**
- Mailchimp
  - What it's used for: Email newsletter subscription
  - Integration: `pages/api/mailchimp.js`
  - SDK/Client: `@mailchimp/mailchimp_marketing` (v3.0.58)
  - Auth: `MAILCHIMP_API_KEY`, `MAILCHIMP_API_SERVER`
  - Audience: `MAILCHIMP_AUDIENCE_ID`
  - Endpoint: `/api/mailchimp` (POST with email body)

- Buttondown
  - What it's used for: Email newsletter subscription (alternative provider)
  - Integration: `pages/api/buttondown.js`
  - Method: REST API POST
  - Auth: `BUTTONDOWN_API_KEY` (Token-based)
  - API: `BUTTONDOWN_API_URL=https://api.buttondown.email/v1/`
  - Endpoint: `/api/buttondown` (POST with email body)

- ConvertKit
  - What it's used for: Email newsletter subscription (alternative provider)
  - Integration: `pages/api/convertkit.js`
  - Method: REST API POST
  - Auth: `CONVERTKIT_API_KEY`
  - API: `CONVERTKIT_API_URL=https://api.convertkit.com/v3/`
  - Form: `CONVERTKIT_FORM_ID` (required, fetch via `/forms?api_key=<key>`)
  - Endpoint: `/api/convertkit` (POST with email body)

**Comment Systems (Multi-provider):**
- Giscus (primary)
  - What it's used for: Blog post comments via GitHub Discussions
  - Configuration: `data/siteMetadata.js` (giscusConfig)
  - Auth: `NEXT_PUBLIC_GISCUS_REPO`, `NEXT_PUBLIC_GISCUS_REPOSITORY_ID`, `NEXT_PUBLIC_GISCUS_CATEGORY`, `NEXT_PUBLIC_GISCUS_CATEGORY_ID`
  - Mapping: pathname-based discussion linking

- Utterances (alternative)
  - What it's used for: GitHub Issues-based comments
  - Configuration: `data/siteMetadata.js` (utterancesConfig)
  - Auth: `NEXT_PUBLIC_UTTERANCES_REPO`

- Disqus (alternative)
  - What it's used for: Third-party comment system
  - Configuration: `data/siteMetadata.js` (disqusConfig)
  - Auth: `NEXT_PUBLIC_DISQUS_SHORTNAME`

**Analytics:**
- Google Analytics
  - What it's used for: Website traffic and user behavior tracking
  - Config: `data/siteMetadata.js` (analytics.googleAnalyticsId)
  - ID: `G-8D0KS7FXMR`
  - Implementation: Next.js auto-instrumentation (setup assumed in pages/_app.js or _document.js)

## Data Storage

**File Storage:**
- AWS S3
  - Provider: Amazon S3 (sac-gallery bucket)
  - What it's used for: Photo gallery image storage and retrieval
  - Integration: `pages/api/photos.js`, `pages/api/get-years.js`
  - Client: `aws-sdk` (v2.1692.0)
  - Bucket: `S3_BUCKET_NAME=sac-gallery`
  - Region: `AWS_REGION=us-east-1`
  - Auth: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - Optional Endpoint: `AWS_S3_ENDPOINT` (for LocalStack testing)
  - Features:
    - Signed URL generation (1-hour expiry)
    - Object metadata for title, description, trueDate flag
    - Year-based folder structure (e.g., `2024/`, `2025/`)

**Databases:**
- Not detected - No relational database integration (Prisma, Sequelize, TypeORM, etc.)

**Caching:**
- Node-cache (in-memory)
  - Used for: APOD API response caching
  - TTL: 6 hours
  - Location: `pages/api/apod.js`

## Authentication & Identity

**Auth Provider:**
- Custom (none detected)
- Membership/User management: Google Apps Script (`appsscript/CreateUser.js`)
  - Handled server-side via Apps Script, not directly integrated into Next.js
  - Supports manual payment entry processing for new membership

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, Rollbar, or similar integration

**Logs:**
- Console logging only
  - Examples: `console.error()` in `pages/api/photos.js` for S3 errors

## CI/CD & Deployment

**Hosting:**
- Vercel
  - Deployment target: `https://sac-website.vercel.app/`
  - Repository: `https://github.com/abdielou/sac-website`

**CI Pipeline:**
- Not detected - No GitHub Actions, Travis CI, or similar configuration

## Environment Configuration

**Required env vars (Production):**
- `AWS_REGION=us-east-1`
- `S3_BUCKET_NAME=sac-gallery`
- `AWS_ACCESS_KEY_ID` (for S3 access)
- `AWS_SECRET_ACCESS_KEY` (for S3 access)

**Optional env vars (Newsletter - select one provider):**
- `MAILCHIMP_API_KEY`
- `MAILCHIMP_API_SERVER` (e.g., 'us1')
- `MAILCHIMP_AUDIENCE_ID`
- OR
- `BUTTONDOWN_API_KEY`
- OR
- `CONVERTKIT_API_KEY`
- `CONVERTKIT_FORM_ID`

**Optional env vars (Comments - select one provider):**
- `NEXT_PUBLIC_GISCUS_REPO`
- `NEXT_PUBLIC_GISCUS_REPOSITORY_ID`
- `NEXT_PUBLIC_GISCUS_CATEGORY`
- `NEXT_PUBLIC_GISCUS_CATEGORY_ID`
- OR
- `NEXT_PUBLIC_UTTERANCES_REPO`
- OR
- `NEXT_PUBLIC_DISQUS_SHORTNAME`

**Analytics:**
- Google Analytics automatically configured via `G-8D0KS7FXMR` in siteMetadata

**Secrets location:**
- `.env` file (local development, not committed)
- Vercel Environment Variables (production deployment)
- `.env.template` provided as reference

## Webhooks & Callbacks

**Incoming:**
- Not detected

**Outgoing:**
- Not detected - No webhook dispatches to external services

## Content Editing Integration

**Prose.io:**
- What it's used for: Web-based content editor for non-technical authors
- Integration: Blog post MDX files in `data/blog/`
- Build support: `scripts/cleanup-prose-mdx` cleans Prose.io-generated MDX during build

---

*Integration audit: 2026-01-26*
