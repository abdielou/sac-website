# Architecture

**Analysis Date:** 2026-01-26

## Pattern Overview

**Overall:** Next.js static site generation with MDX-based content system, complemented by API routes for dynamic data fetching (gallery photos, newsletter subscriptions, external APIs).

**Key Characteristics:**
- Static content (blog posts, pages) pre-built at deploy time via getStaticProps
- Dynamic client-side gallery and interactive components using SWR for data fetching
- API routes for server-side operations (S3 integration, external service proxies)
- MDX bundling at build time with remark/rehype plugins for markdown processing
- Theme system with next-themes (light/dark toggle)
- Tailwind CSS for styling with custom theme configuration

## Layers

**Presentation Layer:**
- Purpose: Render UI components and pages
- Location: `pages/`, `components/`, `layouts/`
- Contains: Page components, layout wrappers, UI components (Card, Button, etc.), section containers
- Depends on: Data layer, styling (CSS), utility functions
- Used by: End users via HTTP requests

**Data Layer:**
- Purpose: Fetch, process, and supply content to presentation layer
- Location: `lib/mdx.js`, `lib/utils/`, `data/`
- Contains: MDX bundling/processing, file system utilities, site metadata, author definitions, blog posts
- Depends on: File system (during build), AWS S3 (at runtime for photos)
- Used by: Pages via getStaticProps, getStaticPaths; Client components via fetch

**API Layer:**
- Purpose: Handle server-side logic, external service integration, data transformation
- Location: `pages/api/`
- Contains: S3 gallery integration, NASA APOD proxy, newsletter provider integrations, metadata endpoints
- Depends on: AWS SDK, external APIs (NASA, Mailchimp, Buttondown, ConvertKit), environment variables
- Used by: Client-side code via fetch requests, external webhooks

**Styling & Theme Layer:**
- Purpose: Provide consistent visual design and dark/light theme switching
- Location: `css/`, `next.config.js` (Tailwind config)
- Contains: Tailwind CSS setup, custom theme colors, typography styles, code highlighting (Prism)
- Depends on: Tailwind CSS, next-themes
- Used by: All components

## Data Flow

**Blog Post Rendering (Static Generation):**

1. Build time: Next.js invokes `getStaticPaths()` for `[slug].js` to enumerate all blog posts
2. For each slug, `getStaticProps()` calls `getFileBySlug('blog', slug)` from `lib/mdx.js`
3. `getFileBySlug` reads MDX file, extracts frontmatter with gray-matter, bundles code with mdx-bundler
4. During bundling, remark plugins process markdown (TOC, code titles, image conversion), rehype plugins add slug anchors, syntax highlighting, math rendering
5. Returns `{ mdxSource, frontMatter, toc }` to page component
6. Page component wraps content with `PostLayout`, passes to `MDXRemote` for client rendering
7. HTML generated at build time, deployed as static files

**Gallery Photo Listing (Dynamic Client-Side):**

1. Client visits `/gallery`
2. Gallery component mounts, useEffect fetches `/api/get-years` to populate year dropdown
3. Second useEffect fetches `/api/photos?year={year}` (or `/api/photos` for latest)
4. API handler queries S3 bucket with ListObjectsV2, maps objects to photo metadata
5. Signed URLs generated for 1-hour expiry, returned as JSON
6. Component renders photos in masonry grid, filters by year/search term, modal on click

**API Request Flow (Example: Photos):**

1. Client requests `/api/photos?year=2024`
2. `pages/api/photos.js` handler receives query param
3. Initializes AWS S3 client from environment variables
4. Constructs S3 key prefix based on year
5. Lists objects, fetches metadata from S3 object tags
6. Generates signed URLs for each photo
7. Returns JSON array with photo data
8. Client transforms response into gallery component state

**State Management:**

- Build-time state: File system queries, MDX processing, static page generation
- Client-side state: React hooks (useState) for gallery filters, search, modal state
- Request-time state: API route handlers with AWS SDK, external API calls
- Persistent theme: next-themes stores selection in localStorage, hydrated on client mount

## Key Abstractions

**MDX Processing Pipeline (`lib/mdx.js`):**
- Purpose: Convert markdown/MDX files to renderable code and metadata
- Examples: `getFileBySlug()`, `getAllFilesFrontMatter()`, `getFiles()`
- Pattern: File system → gray-matter (frontmatter extraction) → mdx-bundler (MDX compilation) → remark/rehype plugins (transformation)
- Key plugins: remarkTocHeadings (extract headings), remarkCodeTitles (code block titles), rehypeSlug (anchor links), rehypePrismPlus (syntax highlighting), rehypeKatex (math rendering)

**Layout System:**
- Purpose: Provide consistent page structure and styling
- Examples: `PostLayout.js`, `ListLayout.js`, `AuthorLayout.js`, `LayoutWrapper.js`
- Pattern: Wrapper components that compose content with navigation, footer, metadata (SEO)
- Reusability: Post and list layouts shared across blog pages; LayoutWrapper applied globally in _app.js

**S3 Gallery Integration:**
- Purpose: Fetch photos from AWS S3 bucket with metadata
- Examples: `pages/api/photos.js`, `components/Gallery*`
- Pattern: API route handler queries S3 API, transforms metadata into gallery format, client-side React component manages filtering
- Metadata: S3 object tags store title, description, trueDate flag; hierarchy is YYYY/MM/DD/filename.jpg

**SEO/Metadata:**
- Purpose: Generate correct meta tags for social sharing and search engines
- Examples: `components/SEO.js`, `data/siteMetadata.js`
- Pattern: Centralized site config, per-page frontmatter merged with SEO component for head tags

**Newsletter Integration:**
- Purpose: Abstract multiple newsletter providers (Mailchimp, Buttondown, ConvertKit)
- Examples: `pages/api/mailchimp.js`, `pages/api/buttondown.js`, `pages/api/convertkit.js`
- Pattern: Each endpoint accepts email, implements provider-specific API calls
- Configuration: Provider selected in `data/siteMetadata.js`

## Entry Points

**Page Entry (_app.js):**
- Location: `pages/_app.js`
- Triggers: Every page navigation
- Responsibilities: Global theme provider setup (next-themes), global CSS imports, analytics initialization, layout wrapper application, client reload in dev mode

**Document Entry (_document.js):**
- Location: `pages/_document.js`
- Triggers: Server-side HTML rendering
- Responsibilities: HTML structure, font preload, KaTeX stylesheet, favicons, manifest links

**Blog Index:**
- Location: `pages/blog.js`
- Triggers: Navigation to /blog
- Responsibilities: Fetch all blog post frontmatter, paginate, pass to ListLayout component

**Individual Blog Post:**
- Location: `pages/blog/[slug].js` (not in repo, inferred from architecture)
- Triggers: Navigation to /blog/[slug]
- Responsibilities: getStaticPaths → all slugs, getStaticProps → MDX bundling, render with PostLayout

**Gallery Page:**
- Location: `pages/gallery.js`
- Triggers: Navigation to /gallery
- Responsibilities: Client-side state management for filters, API calls to fetch years and photos, grid rendering with modals

**API Routes:**
- `/api/photos` - S3 photo listing with optional year filter
- `/api/get-years` - Available gallery year folders
- `/api/apod` - NASA Astronomy Picture of the Day proxy (RSS parsed, cached 6 hours)
- `/api/mailchimp`, `/api/buttondown`, `/api/convertkit` - Newsletter subscriptions

## Error Handling

**Strategy:** Try-catch blocks in API routes returning 500 status on errors; client-side galleries display error state; no global error boundary detected.

**Patterns:**
- API routes: `try { ... } catch (error) { console.error(); return res.status(500).json({ error: 'message' }) }`
- Gallery page: Error state stored in component, displayed as message (e.g., "Failed to fetch year list")
- MDX bundling: Errors logged to console during build; build fails if file parsing fails
- S3 operations: AWS SDK throws errors caught in handler try-catch

## Cross-Cutting Concerns

**Logging:** Primarily console.error() for API errors and client fetch failures; no structured logging framework detected.

**Validation:**
- Frontmatter validation: gray-matter parses YAML, no schema validation detected
- Query parameters: Minimal validation (e.g., year param expected to be numeric)
- S3 metadata: Defensive parsing (e.g., trueDate defaults to true if missing)

**Authentication:**
- No authentication detected in API routes (all endpoints public)
- Google Forms/external forms used for membership/event signup
- Newsletter endpoints publicly accessible (rate limiting likely handled by provider)

**Caching:**
- APOD API: 6-hour TTL with NodeCache
- S3 gallery: No caching at API level; images cached via browser HTTP headers (minimumCacheTTL: 6 hours in next.config.js)
- Static pages: Next.js default caching (revalidation period not configured, so ISR not used)

---

*Architecture analysis: 2026-01-26*
