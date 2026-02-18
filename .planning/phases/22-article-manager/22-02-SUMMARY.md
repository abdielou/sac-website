---
phase: 22-article-manager
plan: 02
subsystem: ui, api
tags: [codemirror, mdx-preview, markdown-editor, article-editor, image-upload, drag-and-drop]

# Dependency graph
requires:
  - phase: 22-01-article-crud-api
    provides: "Article CRUD API endpoints, image upload endpoint, article list page"
  - phase: 21-blog-rendering
    provides: "MDX rendering pipeline with next-mdx-remote, MDXComponents"
provides:
  - "CodeMirror-based markdown editor at /admin/articles/new and /admin/articles/edit/[...slug]"
  - "Live MDX preview with same components as public blog"
  - "Metadata form with tag autocomplete, author dropdown, featured image upload"
  - "Image upload via toolbar button and drag-and-drop"
  - "Component insert menu for YouTube, Facebook, Twitter, ImageCaption, TOC"
  - "Preview API endpoint compiling MDX server-side"
  - "Authors API endpoint reading data/authors/*.md"
  - "useArticleEditor hook for editor state management"
affects: []

# Tech tracking
tech-stack:
  added: ["@uiw/react-codemirror", "@codemirror/lang-markdown", "@codemirror/language-data", "@codemirror/theme-one-dark"]
  patterns: [codemirror-dynamic-import, debounced-mdx-preview, toolbar-insert-at-cursor, drag-and-drop-upload]

key-files:
  created:
    - app/admin/articles/new/page.js
    - app/admin/articles/edit/[...slug]/page.js
    - components/admin/ArticleEditor.js
    - components/admin/ArticleMetadataForm.js
    - components/admin/ArticlePreview.js
    - components/admin/ImageUploadButton.js
    - components/admin/ComponentInsertMenu.js
    - app/api/admin/articles/preview/route.js
    - app/api/admin/articles/authors/route.js
    - lib/hooks/useArticleEditor.js
  modified:
    - package.json

key-decisions:
  - "Dynamic import for CodeMirror (next/dynamic with ssr:false) to avoid SSR hydration issues"
  - "Client-side MDXRemote from next-mdx-remote (not /rsc) for preview since editor is client component"
  - "Preview API uses serialize() with same remark/rehype plugins as public blog for rendering parity"
  - "Editor exposes insertAtCursor utility for shared use by ImageUploadButton and ComponentInsertMenu"
  - "Toolbar uses composable toolbarExtra prop to inject image upload and component insert buttons"
  - "Edit page splits into outer (data loading) and inner (editor hook) components since useArticleEditor needs initialArticle at mount"
  - "All Task 2 components (ImageUploadButton, ComponentInsertMenu) created in Task 1 since new/edit pages import them"

patterns-established:
  - "CodeMirror in Next.js App Router: dynamic import with ssr:false, onCreateEditor for ref access"
  - "Cursor insertion pattern: export insertAtCursor from editor, import in toolbar components"
  - "Debounced preview: 500ms debounce + AbortController for cancellation of stale requests"
  - "Editor page data flow: page fetches data → passes to editor hook → hook manages state and API calls"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Phase 22 Plan 02: Article Editor Summary

**CodeMirror markdown editor with live MDX preview, metadata form (tag autocomplete, author dropdown, featured image), image upload (button + drag-and-drop), and component insert menu for YouTube/Facebook/Twitter/ImageCaption/TOC**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-17T21:25:13Z
- **Completed:** 2026-02-17T21:33:13Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Full article editor with CodeMirror 6, markdown syntax highlighting, dark mode support, and line wrapping
- Live MDX preview with 500ms debounce using same plugins as public blog (remark-gfm, rehype-prism, etc.)
- Metadata form with title, date, author dropdown (from data/authors/*.md), tag autocomplete, summary, and featured image upload with thumbnail preview
- Side-by-side editor/preview layout on desktop, tab-switched on mobile
- Image upload via toolbar button (file picker) and drag-and-drop into editor area with visual feedback overlay
- Component insert dropdown menu for YouTube, Facebook, Twitter, ImageCaption, and TOC with URL prompts
- Toolbar with Bold, Italic, Heading, Link, Horizontal Rule, Image, and Component Insert buttons
- useArticleEditor hook managing save draft, publish, delete, dirty tracking, and unsaved changes warning
- New article page (/admin/articles/new) and edit page (/admin/articles/edit/[...slug]) with loading skeleton and delete confirmation dialog

## Task Commits

Each task was committed atomically:

1. **Task 1: Editor pages, metadata form, preview, and CodeMirror** - `40fe5b6` (feat)
2. **Task 2: Image upload and component insert menu** - included in `40fe5b6` (components required by Task 1 pages for build)

Note: Task 2's files (ImageUploadButton, ComponentInsertMenu) were created in Task 1's commit because the new/edit pages import them, and `npm run build` requires all imports to resolve. The full implementations were written upfront rather than as stubs.

## Files Created/Modified
- `app/admin/articles/new/page.js` - New article creation page with metadata form, editor, preview
- `app/admin/articles/edit/[...slug]/page.js` - Edit article page with loading, error states, delete confirmation
- `components/admin/ArticleEditor.js` - CodeMirror editor with toolbar, drag-and-drop, insertAtCursor utility
- `components/admin/ArticleMetadataForm.js` - Metadata form: title, date, author, tags, summary, featured image
- `components/admin/ArticlePreview.js` - Debounced live MDX preview with error display
- `components/admin/ImageUploadButton.js` - Toolbar button for S3 image upload + uploadImage utility
- `components/admin/ComponentInsertMenu.js` - Dropdown for YouTube/Facebook/Twitter/ImageCaption/TOC insertion
- `app/api/admin/articles/preview/route.js` - POST endpoint compiling MDX with serialize()
- `app/api/admin/articles/authors/route.js` - GET endpoint returning authors from data/authors/*.md
- `lib/hooks/useArticleEditor.js` - Hook managing editor state, save/publish/delete, dirty tracking
- `package.json` - Added CodeMirror dependencies

## Decisions Made
- Used `@uiw/react-codemirror` as the React wrapper for CodeMirror 6 -- lightweight, well-maintained, works with Next.js App Router as client component
- Dynamic import (`next/dynamic` with `ssr: false`) for CodeMirror to prevent server-side rendering issues
- Client-side `MDXRemote` from `next-mdx-remote` (not `/rsc`) for preview rendering since the editor is a client component
- Preview API endpoint uses `serialize()` with the exact same remark/rehype plugin chain as the public blog for rendering parity
- Exported `insertAtCursor` utility from ArticleEditor for shared use by ImageUploadButton and ComponentInsertMenu
- Split edit page into outer (data loading) and inner (editor hook) components because `useArticleEditor` needs `initialArticle` at mount time
- Used `toolbarExtra` prop pattern to compose toolbar buttons without tight coupling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prettier formatting on JSX elements**
- **Found during:** Task 1 (all new components)
- **Issue:** Prettier required single-line formatting for short JSX elements
- **Fix:** Ran `eslint --fix` to auto-format
- **Files modified:** All 6 component files + 2 page files
- **Verification:** `npx eslint` passes clean
- **Committed in:** 40fe5b6 (Task 1 commit)

**2. [Rule 3 - Blocking] Tasks 1 and 2 merged into single commit**
- **Found during:** Task 1 (page compilation)
- **Issue:** New/edit pages import ImageUploadButton and ComponentInsertMenu — build fails without them
- **Fix:** Created full implementations of Task 2 components during Task 1 to satisfy build
- **Files modified:** components/admin/ImageUploadButton.js, components/admin/ComponentInsertMenu.js
- **Committed in:** 40fe5b6 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 formatting bug, 1 blocking dependency)
**Impact on plan:** Formatting auto-fixed. Task merge was necessary for build success — no scope creep, just execution order adjustment.

## Issues Encountered
None -- build succeeds, ESLint clean, all pages and API routes compile correctly.

## User Setup Required
None -- uses existing S3 and auth configuration from prior phases. CodeMirror packages are self-contained with no external service dependencies.

## Next Phase Readiness
- Article Manager (Phase 22) is complete: CRUD API, list page, and full editor experience
- All article management can be done from the admin dashboard
- No further plans in Phase 22

## Self-Check: PASSED

- [x] app/admin/articles/new/page.js exists
- [x] app/admin/articles/edit/[...slug]/page.js exists
- [x] components/admin/ArticleEditor.js exists
- [x] components/admin/ArticleMetadataForm.js exists
- [x] components/admin/ArticlePreview.js exists
- [x] components/admin/ImageUploadButton.js exists
- [x] components/admin/ComponentInsertMenu.js exists
- [x] app/api/admin/articles/preview/route.js exists
- [x] app/api/admin/articles/authors/route.js exists
- [x] lib/hooks/useArticleEditor.js exists
- [x] Commit 40fe5b6 found
- [x] npm run build passes

---
*Phase: 22-article-manager*
*Completed: 2026-02-17*
