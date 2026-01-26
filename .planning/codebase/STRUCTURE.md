# Codebase Structure

**Analysis Date:** 2026-01-26

## Directory Layout

```
sac-website/
├── pages/                  # Next.js pages and API routes
│   ├── _app.js            # Global app wrapper (theme, analytics, layout)
│   ├── _document.js       # HTML document structure
│   ├── 404.js             # Custom 404 page
│   ├── api/               # API route handlers
│   │   ├── apod.js        # NASA APOD RSS proxy
│   │   ├── photos.js      # S3 gallery photos
│   │   ├── get-years.js   # Available gallery years
│   │   ├── mailchimp.js   # Mailchimp newsletter subscription
│   │   ├── buttondown.js  # Buttondown newsletter subscription
│   │   └── convertkit.js  # ConvertKit newsletter subscription
│   ├── blog/              # Blog dynamic routes
│   │   └── [slug].js      # Individual blog post page (with getStaticProps/getPaths)
│   │   └── tags/          # Tag filtering pages
│   ├── blog.js            # Blog index/listing page
│   ├── index.js           # Home page
│   ├── about.js           # About page
│   ├── contact.js         # Contact page
│   ├── gallery.js         # Gallery page with client-side filtering
│   ├── events.js          # Events page
│   ├── membership.js      # Membership page
│   ├── weather.js         # Weather page
│   ├── brand.js           # Brand/logo guidelines page
│   ├── donate.js          # Donations page
│   ├── links.js           # Links aggregation page (forced light theme)
│   └── tags.js            # Tags listing page
├── components/            # React components
│   ├── articles/          # Article-related components
│   │   └── ArticleItem.js # Blog post list item
│   ├── widgets/           # Reusable widget components
│   ├── social-icons/      # Social media icon components
│   ├── analytics/         # Google Analytics wrapper
│   ├── comments/          # Comment system components (Giscus)
│   ├── Card.js            # Generic card component
│   ├── Footer.js          # Footer component
│   ├── LayoutWrapper.js   # Global page layout wrapper
│   ├── MobileNav.js       # Mobile navigation menu
│   ├── ThemeSwitch.js     # Dark/light theme toggle button
│   ├── SEO.js             # SEO meta tag component
│   ├── NewsletterForm.js  # Email signup form
│   ├── Pagination.js      # Blog pagination
│   ├── GalleryGrid.js     # Photo grid layout
│   ├── GalleryFilters.js  # Year/search filter controls
│   ├── GalleryImageModal.js # Photo lightbox modal
│   ├── MemberIdCard.js    # Membership ID card (PDF generation)
│   ├── MDXComponents.js   # Custom MDX element overrides
│   ├── Pre.js             # Code block component with copy button
│   ├── ScrollTopAndComment.js # Scroll-to-top and comments toggle
│   ├── TwitterEmbed.js    # Twitter embed wrapper
│   └── ...other utilities
├── layouts/               # Page layout templates
│   ├── PostLayout.js      # Blog post layout (header, metadata, nav)
│   ├── ListLayout.js      # List/index layout (search, pagination)
│   ├── AuthorLayout.js    # Author profile layout
│   ├── AuthorListLayout.js # Authors listing layout
│   ├── PostSimple.js      # Minimal blog layout
│   └── AboutCardLayout.js # About page card grid layout
├── lib/                   # Core utilities and processing
│   ├── mdx.js             # MDX processing pipeline
│   │   ├── getFiles()      # Get all markdown files in folder
│   │   ├── getFileBySlug() # Load and bundle single MDX file
│   │   ├── getAllFilesFrontMatter() # Batch frontmatter extraction
│   │   ├── formatSlug()    # Convert file path to URL slug
│   │   └── dateSortDesc()  # Sort posts by date descending
│   ├── generate-rss.js    # RSS feed generation
│   ├── remark-code-title.js    # Remark plugin: extract code block titles
│   ├── remark-img-to-jsx.js    # Remark plugin: convert img to next/image
│   ├── remark-toc-headings.js  # Remark plugin: extract table of contents
│   ├── utils/             # Utility functions
│   │   ├── files.js       # Recursive file listing
│   │   ├── formatDate.js  # Date formatting utilities
│   │   ├── galleryUtils.js # Gallery image dimension handling
│   │   ├── htmlEscaper.js # HTML escaping
│   │   └── kebabCase.js   # String kebab-case conversion
│   └── mockS3.js          # Local S3 mock for development
├── data/                  # Content and configuration
│   ├── siteMetadata.js    # Site config (title, URLs, social links, analytics)
│   ├── headerNavLinks.js  # Navigation menu items
│   ├── authors/           # Author profiles (markdown with frontmatter)
│   │   ├── abdiel.md
│   │   ├── eddie.md
│   │   ├── francisco.md
│   │   ├── ... (12 total)
│   └── blog/              # Blog posts (organized by YYYY/MM/DD)
│       ├── 2017/04/13/PlanetaDosSoles04132017.mdx
│       ├── 2019/09/26/Kruger60.mdx
│       ├── 2020/01/17/MeteoroEnero.mdx
│       ├── 2020/07/21/Cometa*.mdx
│       ├── 2021/*/...
│       ├── 2022/*/...
│       ├── 2023/*/...
│       ├── 2024/*/...
│       └── (posts with draft/archived in frontmatter excluded from builds)
├── css/                   # Global styles
│   ├── tailwind.css       # Tailwind imports and custom theme
│   └── prism.css          # Syntax highlighting styles
├── public/                # Static assets (served from root)
│   └── static/            # User-accessible static files
│       ├── favicons/      # Browser tabs/shortcuts
│       └── images/        # Logos, banners, avatars
├── scripts/               # Build and utility scripts
│   ├── cleanup-prose-mdx.js # Clean Prose.io formatting from MDX
│   ├── generate-sitemap.js  # Generate sitemap.xml at build time
│   └── next-remote-watch.js # Watch remote file changes (Prose.io editing)
├── appsscript/            # Google Apps Script for membership
│   └── CreateUser.gs      # Create users from form responses
├── test/                  # Test files
│   └── *.test.js          # Jest test files
├── .next/                 # Build output (not committed)
├── node_modules/          # Dependencies (not committed)
├── .planning/             # GSD planning documentation
│   └── codebase/          # Architecture/structure docs
├── jsconfig.json          # Path aliases configuration
├── next.config.js         # Next.js configuration
├── jest.config.js         # Jest testing configuration
├── .eslintrc.js           # ESLint rules
├── package.json           # Dependencies and scripts
├── .env.template          # Environment variables template
├── CLAUDE.md              # Project guidelines
└── README.md              # Project documentation
```

## Directory Purposes

**pages/:**
- Purpose: Next.js routing - files map to URL routes
- Contains: Page components (.js/.mdx), API routes (api/ subdirectory)
- Conventions: Kebab-case filenames for pages, [brackets] for dynamic routes, underscore prefix for special files (_app, _document)

**components/:**
- Purpose: Reusable React components shared across pages
- Contains: UI components (buttons, cards, layouts), feature-specific components (gallery, comments, newsletter)
- Organization: Subdirectories group related components (articles/, widgets/, social-icons/, analytics/, comments/)

**layouts/:**
- Purpose: Page-level layout templates that wrap page content
- Contains: PostLayout (blog posts), ListLayout (blog indexes), AuthorLayout (author pages)
- Pattern: Each layout composes a page template with consistent header, navigation, footer

**lib/:**
- Purpose: Core business logic and utilities
- Contains: MDX processing pipeline, RSS generation, remark/rehype plugins, utility functions
- Key module: `mdx.js` - the heart of content processing

**data/:**
- Purpose: Static content, configuration, and author metadata
- Contains: Blog posts (MDX/MD files), author profiles, site configuration
- Organization: Blog organized by date (YYYY/MM/DD), authors as individual .md files

**css/:**
- Purpose: Global styling and theme configuration
- Contains: Tailwind CSS setup, custom color theme, code highlighting
- Note: Component-level styles typically inline with Tailwind classes

**public/:**
- Purpose: Static files served at root (favicons, images, fonts)
- Contains: Favicons, branding assets, static images for pages
- Accessed: /static/... URLs in code

**scripts/:**
- Purpose: Build-time utilities and automation
- Contains: Prose.io cleanup, sitemap generation, file watching
- Execution: Run from npm scripts during build or dev

**appsscript/:**
- Purpose: Google Apps Script for membership form automation
- Contains: CreateUser.gs - creates users from Google Form responses
- External: Deployed separately in Google Cloud

**test/:**
- Purpose: Test files for Jest
- Contains: Unit and integration tests for components, utilities, API routes
- Pattern: Co-located with source (*.test.js alongside *.js)

## Key File Locations

**Entry Points:**
- `pages/_app.js`: Root app component, applies theme provider and global layout
- `pages/_document.js`: HTML document shell, loads fonts and stylesheets
- `pages/index.js`: Home page
- `pages/blog.js`: Blog listing page

**Configuration:**
- `data/siteMetadata.js`: Site title, URLs, social links, analytics ID, locale
- `data/headerNavLinks.js`: Main navigation menu items
- `jsconfig.json`: Path aliases (@/components, @/lib, etc.)
- `next.config.js`: Next.js build config (webpack, images domains, Preact aliasing)

**Core Logic:**
- `lib/mdx.js`: MDX bundling, frontmatter parsing, file enumeration
- `pages/api/photos.js`: S3 gallery integration
- `pages/api/apod.js`: NASA APOD caching and proxying
- `components/LayoutWrapper.js`: Global page structure with header/footer
- `layouts/PostLayout.js`: Blog post page structure

**Testing:**
- `jest.config.js`: Jest configuration
- `test/`: Test files (co-located with source)
- `.eslintrc.js`: ESLint configuration

**Build/Development:**
- `scripts/generate-sitemap.js`: Sitemap generation
- `scripts/cleanup-prose-mdx.js`: Prose.io formatting cleanup
- `scripts/next-remote-watch.js`: Remote file watching

## Naming Conventions

**Files:**
- Pages: lowercase, kebab-case (e.g., `blog.js`, `about.js`, `[slug].js`)
- Components: PascalCase (e.g., `LayoutWrapper.js`, `GalleryGrid.js`, `ArticleItem.js`)
- Utilities: camelCase (e.g., `formatDate.js`, `galleryUtils.js`)
- MDX plugins: lowercase with hyphens (e.g., `remark-code-title.js`, `remark-img-to-jsx.js`)
- Tests: `*.test.js` or `*.spec.js`

**Directories:**
- Feature directories: lowercase plural (e.g., `components/`, `pages/`, `layouts/`)
- Nested components: organized by feature (e.g., `components/articles/`, `components/widgets/`)
- Blog content: date-based hierarchy (YYYY/MM/DD/filename.mdx)

**Functions and Classes:**
- Components: PascalCase (React components exportable)
- Utilities: camelCase (pure functions)
- Constants: UPPER_SNAKE_CASE (e.g., `POSTS_PER_PAGE`, `ZOOM_SCALE`)

## Where to Add New Code

**New Blog Post:**
- File location: `data/blog/YYYY/MM/DD/filename.mdx` (or `.md`)
- Frontmatter required: `title`, `date`, `tags`, `draft` (optional), `authors` (references `data/authors/*.md`)
- Component access: Automatically discovered by `lib/mdx.js` functions

**New Page:**
- File location: `pages/pagename.js` (becomes `/pagename` route)
- Template: Import layout (PostLayout, ListLayout, etc.) and wrap content
- Static generation: Implement `getStaticProps()` if page needs build-time data
- Example: See `pages/blog.js` for listing, `pages/about.js` for static content

**New Component:**
- File location: `components/ComponentName.js` or `components/feature/ComponentName.js` if feature-specific
- Export as default or named: `export default` for standalone, named exports for utility components
- Use path aliases: `import { something } from '@/lib/mdx'` not `'../lib/mdx'`
- Styling: Use Tailwind classes inline; no CSS modules or styled-components

**New API Route:**
- File location: `pages/api/routename.js`
- Handler function: Export default async function with `(req, res)` parameters
- Pattern: Check request method/query, process, return `res.status(code).json(data)` or `res.status(code).send(text)`
- Example: `pages/api/photos.js` for S3 integration, `pages/api/apod.js` for external API proxy

**New Utility:**
- File location: `lib/utils/utilityname.js` (or directly in `lib/` if heavily used)
- Pattern: Export named functions, no default exports for utility modules
- Usage: Import with path aliases in components/pages
- Example: `lib/utils/formatDate.js`

**New Author:**
- File location: `data/authors/slug.md`
- Frontmatter: `name`, `avatar` (path to image), optional `twitter`, `email`, etc.
- Usage: Reference in blog post frontmatter `authors: ['slug']` array

**Styling:**
- Theme colors: Update `css/tailwind.css` or next.config.js Tailwind theme extension
- Global styles: Add to `css/tailwind.css` `@apply` directives or custom CSS
- Component styles: Use Tailwind class names inline (no BEM or CSS modules)

## Special Directories

**`.next/`:**
- Purpose: Build output from `npm run build`
- Generated: Yes (by Next.js)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by npm install from package-lock.json)
- Committed: No (in .gitignore)

**`public/static/`:**
- Purpose: User-accessible static files (favicons, images, downloadable assets)
- Generated: No (manually maintained)
- Committed: Yes

**`data/blog/`:**
- Purpose: Blog post content
- Generated: No (manually created or via Prose.io editor)
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: GSD architecture documentation
- Generated: Yes (by `/gsd:map-codebase` command)
- Committed: Yes

---

*Structure analysis: 2026-01-26*
