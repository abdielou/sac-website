# Roadmap: SAC Website

## Milestones

- v1.0 MVP - Phases 1-5 (shipped 2026-01-27)
- v1.1 FB-YT Archive - Phase 6 (shipped 2026-01-29)
- v1.2 PayPal Payments - Phase 7 (shipped 2026-01-30)
- v1.3 Admin Dashboard - Phases 8-12 (shipped 2026-02-05)
- v1.4 Payment Classification & Apps Script - Phases 13-16 (shipped 2026-02-10)
- v1.5 Calendar-Year Membership Rules - Phases 17-18 (shipped 2026-02-12)
- v1.6 Article Manager - Phases 19-22 (in progress)

## Phases

<details>
<summary>v1.0 through v1.5 (Phases 1-18) - SHIPPED</summary>

See .planning/MILESTONES.md for details on shipped milestones.

</details>

### v1.6 Article Manager (In Progress)

**Milestone Goal:** Replace manual MDX-file-and-git workflow with an admin dashboard article manager backed by S3, including migration of all existing blog content and images.

- [x] **Phase 19: S3 Article Data Layer** - Read/write article JSON to S3 with index management
- [ ] **Phase 20: Blog Rendering from S3** - Public blog reads from S3 instead of MDX files on disk
- [ ] **Phase 21: Content Migration** - Move all existing MDX posts and blog images from repo to S3
- [ ] **Phase 22: Article Manager** - Admin UI for creating, editing, and managing articles with markdown editor and image upload

## Phase Details

### Phase 19: S3 Article Data Layer
**Goal**: Articles can be stored and retrieved as JSON from S3 with a consistent index
**Depends on**: Nothing (uses existing AWS S3 credentials and bucket)
**Requirements**: S3-01, S3-02
**Success Criteria** (what must be TRUE):
  1. An article can be written to S3 as `articles/{slug}.json` containing metadata and markdown content, and read back identically
  2. The article index at `articles/index.json` is automatically updated whenever an article is created, edited, or deleted
  3. The index contains enough metadata (title, date, tags, summary, draft status, slug) to render listing pages without fetching individual articles
**Plans:** 1 plan

Plans:
- [x] 19-01-PLAN.md — S3 article CRUD utilities and index management

### Phase 20: Blog Rendering from S3
**Goal**: Visitors see the same blog experience (index, posts, tags, RSS, SEO) but all content comes from S3
**Depends on**: Phase 19
**Requirements**: BLOG-01, BLOG-02, BLOG-03, BLOG-04, BLOG-05, BLOG-06
**Success Criteria** (what must be TRUE):
  1. Blog index page lists published articles from S3 with pagination and prev/next navigation
  2. Individual post pages render markdown from S3 with all custom components (Image, ImageCaption, TwitterEmbed, ResponsiveReactPlayer, TOCInline)
  3. Tag cloud and tag filter pages display correct articles from S3
  4. RSS feed at /feed.xml contains articles sourced from S3
  5. Open Graph and JSON-LD metadata on post pages are populated from S3 article data
**Plans:** 2 plans

Plans:
- [x] 20-01-PLAN.md — Blog index, pagination, and post pages from S3 with next-mdx-remote
- [x] 20-02-PLAN.md — Tag pages, RSS feed, and on-demand revalidation API

### Phase 21: Content Migration
**Goal**: All existing blog posts and images live in S3 as the single source of truth
**Depends on**: Phase 19, Phase 20
**Requirements**: MIG-01, MIG-02
**Success Criteria** (what must be TRUE):
  1. Every existing MDX post in `data/blog/` has a corresponding `articles/{slug}.json` in S3 with all frontmatter and content preserved
  2. All blog images from `public/static/images/blog/` are in S3 and image references in migrated articles point to S3 URLs
  3. The public blog renders all migrated posts correctly (spot-check oldest, newest, and a post with custom components)
**Plans:** 2 plans

Plans:
- [ ] 21-01-PLAN.md — Migration script with MDX parsing, image upload, JSON generation, and index rebuild
- [ ] 21-02-PLAN.md — Execute migration, verify results, and archive originals to backup branch

### Phase 22: Article Manager
**Goal**: Admins can create, edit, publish, and manage articles entirely from the dashboard
**Depends on**: Phase 19
**Requirements**: ART-01, ART-02, ART-03, ART-04, ART-05, EDIT-01, EDIT-02, EDIT-03, IMG-01, IMG-02
**Success Criteria** (what must be TRUE):
  1. Admin can see a list of all articles with title, date, status (draft/published), and tags
  2. Admin can create a new article with title, date, tags, summary, author, featured image, and markdown content, then see it appear in the list
  3. Admin can edit an existing article's content and metadata, and changes are reflected on the public blog
  4. Admin can toggle an article between published and draft status, and draft articles do not appear on the public blog
  5. Admin can upload an image from the editor, and the uploaded image URL is inserted into the markdown at the cursor position
**Plans**: TBD

Plans:
- [ ] 22-01: Article list page and CRUD API routes
- [ ] 22-02: Markdown editor with preview, metadata form, and image upload

## Progress

**Execution Order:**
Phases execute in numeric order: 19 -> 20 -> 21 -> 22

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5 | v1.0 | 15/15 | Complete | 2026-01-27 |
| 6 | v1.1 | 3/3 | Complete | 2026-01-29 |
| 7 | v1.2 | 2/2 | Complete | 2026-01-30 |
| 8-12 | v1.3 | 11/11 | Complete | 2026-02-05 |
| 13-16 | v1.4 | 7/7 | Complete | 2026-02-10 |
| 17-18 | v1.5 | 3/3 | Complete | 2026-02-12 |
| 19. S3 Article Data Layer | v1.6 | 1/1 | Complete | 2026-02-12 |
| 20. Blog Rendering from S3 | v1.6 | 2/2 | Complete | 2026-02-12 |
| 21. Content Migration | v1.6 | 0/2 | Not started | - |
| 22. Article Manager | v1.6 | 0/2 | Not started | - |
