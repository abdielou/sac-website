# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the website for **Sociedad de Astronomía del Caribe (SAC)** - a non-profit astronomy organization based in Puerto Rico. The site is in Spanish (`es-PR` locale).

## Development Commands

```bash
npm run dev       # Start dev server with hot reload
npm run build     # Production build (runs cleanup script, next build, generates sitemap)
npm run serve     # Serve production build
npm run lint      # ESLint with auto-fix
npm run test      # Run Jest tests
npm run analyze   # Bundle analysis (set ANALYZE=true)
npm run start     # Dev with remote file watching (for Prose.io content editing)
```

## Architecture

**Next.js 12** with Preact in production builds for smaller bundle size.

### Key Directories

- **pages/** - Next.js pages and API routes
- **components/** - React components (widgets/, articles/, social-icons/)
- **layouts/** - Page layouts for different content types (PostLayout, AuthorLayout, ListLayout)
- **lib/** - Core utilities including MDX processing (`lib/mdx.js`)
- **data/** - Content and configuration:
  - `data/blog/` - MDX/MD blog posts organized by year (e.g., `2024/02/`, `2024/03/`)
  - `data/authors/` - Author markdown files with frontmatter (name, avatar)
  - `data/siteMetadata.js` - Site configuration (URLs, social links, analytics, comments)
  - `data/headerNavLinks.js` - Navigation menu items
- **scripts/** - Build utilities (sitemap generation, Prose.io MDX cleanup)
- **appsscript/** - Google Apps Script for membership management (CreateUser.js)

### Content System

Blog posts use MDX with frontmatter:
```yaml
---
title: 'Post Title'
date: 2024-01-01T08:00:00Z
tags: ['tag1', 'tag2']
draft: false
summary: 'Post summary'
images: ['static/images/path/image.png']
imgWidth: 512
imgHeight: 512
authors: ['author-slug']  # References data/authors/*.md
---
```

Posts with `draft: true` or `archived: true` are excluded from listings.

### API Routes

- `/api/apod` - NASA Astronomy Picture of the Day proxy
- `/api/photos` - S3 gallery photos (requires AWS credentials)
- `/api/get-years` - Available gallery years
- `/api/mailchimp`, `/api/buttondown`, `/api/convertkit` - Newsletter integrations

### External Integrations

- **AWS S3** - Photo gallery storage (`S3_BUCKET_NAME=sac-gallery`)
- **Giscus** - Blog comments (GitHub Discussions)
- **Google Analytics** - Traffic analytics
- **Prose.io** - Web-based content editor for non-technical authors

### Environment Variables

Copy `.env.template` to `.env`. Key variables:
- `NEXT_PUBLIC_GISCUS_*` - Comment system
- `AWS_REGION`, `S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - Gallery S3
- Newsletter API keys (Mailchimp/Buttondown/ConvertKit)

## Testing

Jest with jsdom environment. Tests in `test/` directory.

```bash
npm run test              # Run all tests
npx jest path/to/test.js  # Run single test file
```

## Path Aliases

Configured in `jsconfig.json`:
- `@/components/*` - components/
- `@/pages/*` - pages/
- `@/lib/*` - lib/
