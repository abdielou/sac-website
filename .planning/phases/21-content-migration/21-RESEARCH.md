# Phase 21: Content Migration - Research

**Researched:** 2026-02-13
**Domain:** One-time migration of blog content (MDX posts + images) from filesystem to S3
**Confidence:** HIGH

## Summary

Phase 21 is a one-time migration script that reads all 77 MDX/MD blog posts from `data/blog/` and 215 images (~133 MB) from `public/static/images/blog/`, transforms the posts to JSON format compatible with the Phase 19 S3 article data layer, uploads images to a public S3 bucket, rewrites image references in content to point to S3 URLs, and uploads the article JSON to the private articles bucket. After successful migration, original files are archived to a backup git branch.

The project already has all the necessary libraries installed: `gray-matter` (4.0.3) for frontmatter parsing, `aws-sdk` (2.1692.0) for S3 operations, and the Phase 19 `lib/articles-s3.js` module for article JSON storage. The migration script is a Node.js CommonJS script in the `scripts/` directory, following existing project conventions.

**Primary recommendation:** Build a single `scripts/migrate-blog-to-s3.js` script that uses gray-matter to parse MDX frontmatter, preserves filesystem slugs (not regenerated from title), uploads images first then articles, rewrites all image references to S3 URLs, and builds the article index in a single bulk operation at the end (not incrementally per article).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Migration Execution Strategy
- **Dry-run mode required**: Script must preview all changes without migrating (--dry-run flag), then run again with --live flag
- **Post-migration archival**: After successful migration, archive original MDX files and images to a backup git branch (not deleted)
- **All-at-once migration**: Migrate all posts in one script run (not phased by year)
- **Error handling**: Stop on first error (fail fast) - if any post/image fails, stop migration and report issue

#### Image Organization in S3
- **Bucket separation** (from Phase 19): Articles in private bucket (S3_ARTICLES_BUCKET_NAME), images in public bucket (S3_IMAGES_BUCKET_NAME or new env var)
- **Path structure**: Mirror existing blog structure - `images/blog/YYYY/MM/filename.jpg` (preserves structure from `public/static/images/blog/`)
- **Image processing**: Upload as-is (no optimization or compression during migration)
- **Upload verification**: Verify each image upload succeeds before continuing (granular verification)
- **URL format**: Direct S3 URLs in article content (not CloudFront) - `https://[bucket].s3.amazonaws.com/images/blog/*`
- **Image reference detection**: Auto-detect all image reference patterns in MDX (report patterns found, handle all variations)
- **Missing images**: Stop migration if article references image that doesn't exist in filesystem (fail fast)

#### Content Transformation Rules
- **Slug format** (from Phase 19): `YYYY/MM/DD/title-slug` - preserves existing blog URL structure
- **Content scope**: Migrate everything - published posts, draft posts (draft: true), and archived posts (archived: true)
- **Frontmatter validation**: Stop migration if required fields missing (title, date, etc.) - fail fast, no default filling
- **Content preservation**: Preserve MDX content exactly as-is (no normalization, line ending conversion, or whitespace cleanup)

#### Verification & Validation
- **Verification methods**: All four required
  1. Automated count check - verify same number of posts/images in S3 as filesystem
  2. Sample post rendering - automatically render 3-5 posts (oldest, newest, one with custom components)
  3. Manual spot-check list - script outputs specific posts for user to manually review
  4. Full build test - run `npm run build` and verify no errors
- **Success criteria**: Automated checks pass AND user completes manual review of spot-check list
- **Index rebuild**: Automatically rebuild `articles/index.json` after all posts migrated (call rebuildArticleIndex())
- **Migration logging**: Create detailed log file with every post/image migrated, timestamps, any warnings (not just console output)

### Claude's Discretion
- Choice of MDX parsing library (gray-matter, remark, etc.)
- Image upload parallelization strategy (sequential vs parallel with concurrency limits)
- Progress reporting format and frequency
- Exact format of dry-run preview output
- Structure of migration log file
- Specific posts to include in spot-check list

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gray-matter | 4.0.3 | Parse MDX frontmatter | Already used by `lib/mdx.js` in project; standard for YAML frontmatter extraction |
| aws-sdk | 2.1692.0 | S3 uploads (images + articles) | Already used by project (`lib/articles-s3.js`, `pages/api/photos.js`); v2 API |
| path, fs | Node built-in | File system traversal | Standard Node.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lib/articles-s3.js | project | `putArticleJSON`, `putArticleIndex` | For writing article JSON to S3_ARTICLES_BUCKET_NAME |
| lib/articles.js | project | `ARTICLE_FIELDS`, `INDEX_FIELDS`, slug generation reference | For article JSON shape and index field definitions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gray-matter | remark + frontmatter plugin | gray-matter is simpler and already installed; remark is heavier and not needed since we preserve MDX content as-is |
| Sequential image uploads | Parallel with concurrency limit | **Recommend parallel (5-10 concurrent)** for 215 images at ~133 MB total; sequential would take significantly longer |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Script Structure
```
scripts/
└── migrate-blog-to-s3.js   # Single migration script (CommonJS)
```

### Pattern 1: Two-Phase Migration (Images First, Then Articles)
**What:** Upload all images to S3 first, then process and upload articles with rewritten image URLs.
**When to use:** Always - images must be in S3 before we can construct their URLs for article content.
**Why:** If we process articles and images interleaved, a failure during image upload leaves articles pointing to non-existent S3 URLs. Images-first means we can verify all images are in S3 before touching any articles.

```javascript
// Phase 1: Upload all images to S3_IMAGES_BUCKET_NAME
// Phase 2: Parse all MDX files, rewrite image refs, upload to S3_ARTICLES_BUCKET_NAME
// Phase 3: Build and upload articles/index.json
```

### Pattern 2: Filesystem Slug Preservation
**What:** Use the existing filesystem path as the slug, not regenerated from title.
**When to use:** Always during migration.
**Why critical:** Current live URLs like `/blog/2017/04/13/PlanetaDosSoles04132017` are based on filesystem slugs. The Phase 19 `generateSlug()` function would produce different slugs (e.g., `2017/04/13/planetas-con-dos-soles-tambien-pudieran-ser-habitables`). Using generated slugs would break all existing URLs and SEO.

```javascript
// Current filesystem: data/blog/2017/04/13/PlanetaDosSoles04132017.mdx
// Slug to use: "2017/04/13/PlanetaDosSoles04132017"
// S3 key: "articles/2017/04/13/PlanetaDosSoles04132017.json"
// NOT: "articles/2017/04/13/planetas-con-dos-soles-tambien-pudieran-ser-habitables.json"
```

### Pattern 3: Bulk Index Build (Not Incremental)
**What:** Build the entire `articles/index.json` from collected metadata after all articles are uploaded, rather than calling `rebuildIndexEntry()` per article.
**When to use:** During migration (not for normal CRUD operations).
**Why:** The existing `rebuildIndexEntry()` reads the index, modifies it, and writes it back for each operation. For 77 articles, this would be 77 read-modify-write cycles. Building once at the end is faster and avoids race conditions.

```javascript
// After all articles uploaded, build index from collected metadata
const indexArticles = allMigratedArticles.map(article => {
  const entry = {};
  for (const field of INDEX_FIELDS) {
    if (article[field] !== undefined) entry[field] = article[field];
  }
  return entry;
});
// Sort newest-first, write once
indexArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
await putArticleIndex({ articles: indexArticles, updatedAt: new Date().toISOString() });
```

### Pattern 4: Image Reference Rewriting
**What:** Replace all `/static/images/blog/...` references in MDX content with S3 URLs.
**When to use:** During article content transformation.
**Why:** Four distinct patterns exist in the codebase that all need handling.

### Anti-Patterns to Avoid
- **Regenerating slugs from title:** Would break all existing URLs. Use filesystem path as slug.
- **Incremental index updates:** Would cause 77 S3 read-write cycles. Build index once at end.
- **Processing articles before images:** Would create articles pointing to non-existent image URLs.
- **Ignoring URL encoding for spaces:** 28 images have spaces in filenames. S3 keys can contain spaces, but URLs must use `%20` or `+` encoding.
- **Using `createArticle()` from lib/articles.js:** This function regenerates slugs and rebuilds the index per call. Use `putArticleJSON()` directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex parser | gray-matter (already installed) | Handles edge cases: multi-line arrays, quoted strings, date formats |
| S3 upload | Custom HTTP requests | aws-sdk S3.putObject (already installed) | Handles auth, retries, multipart for large files |
| Article JSON writing | Custom S3 calls | `putArticleJSON()` from `lib/articles-s3.js` | Already handles bucket config, error wrapping, JSON serialization |
| Index building | Custom index logic | `putArticleIndex()` from `lib/articles-s3.js` + `INDEX_FIELDS` from `lib/articles.js` | Ensures index shape matches what the blog renderer expects |
| MIME type detection | Manual extension mapping | `path.extname()` + simple map | Only 5 types needed: .jpg, .png, .gif, .webp, .jfif |

**Key insight:** The Phase 19 code provides `putArticleJSON()` and `putArticleIndex()` for S3 writes. Use these directly instead of creating new S3 upload functions for articles. For images, create a thin wrapper around `S3.putObject()` since image uploads go to a different bucket.

## Common Pitfalls

### Pitfall 1: Slug Mismatch Between Filesystem and Generated Slugs
**What goes wrong:** Using `generateSlug(title, date)` from `lib/articles.js` produces slugs like `2017/04/13/planetas-con-dos-soles-tambien-pudieran-ser-habitables` when the actual URL should be `2017/04/13/PlanetaDosSoles04132017` (based on the filename).
**Why it happens:** Phase 19's `generateSlug()` was designed for new articles, not migration of existing ones.
**How to avoid:** Derive slug from filesystem path: `filePath.replace('data/blog/', '').replace(/\.(mdx|md)$/, '')`.
**Warning signs:** Blog URLs return 404 after migration.

### Pitfall 2: Image URL Encoding with Spaces
**What goes wrong:** 28 image files have spaces in their names (e.g., `Cometa C 2025 F2 SWAN por Victor Rivera SAC1.jpg`). S3 keys can contain spaces, but the URL format `https://bucket.s3.amazonaws.com/path/file name.jpg` needs proper encoding.
**Why it happens:** AWS SDK handles key encoding when uploading, but the URLs in article content must use URL-encoded paths.
**How to avoid:** When constructing S3 URLs for article content, URL-encode the key path. S3 virtual-hosted-style URLs: `https://bucket.s3.amazonaws.com/` + encodeURIComponent-for-each-path-segment.
**Warning signs:** Images display as broken links in migrated articles.

### Pitfall 3: Four Different Image Reference Patterns
**What goes wrong:** Only handling one pattern and missing others.
**Why it happens:** Different blog posts use different syntax for image references.
**How to avoid:** Handle all four patterns found in the codebase:
1. `src={'/static/images/blog/...'}` - JSX expression with single quotes (most common)
2. `src="/static/images/blog/..."` - JSX attribute with double quotes (newer posts)
3. `src={"/static/images/blog/..."}` - JSX expression with double quotes (rare)
4. `![alt](/static/images/blog/...)` - Markdown image syntax (only in example posts)
5. Frontmatter `images:` field - e.g., `images: ['static/images/blog/...']` (no leading `/`)
**Warning signs:** Some images load from old paths, others from S3.

### Pitfall 4: Non-Blog Image References
**What goes wrong:** Some posts reference images outside `public/static/images/blog/`.
**Why it happens:** The `telescopios.mdx` post references `static/images/telescope_color.png` (in frontmatter) and `static/images/blog/telescope_guide/*.webp` (in content). Example posts reference `static/images/canada/*`, `static/images/ocean.jpg`, etc.
**How to avoid:** Decision needed: (a) migrate telescope_guide images to S3 (they ARE under `images/blog/`), (b) leave non-blog image references unchanged (telescope_color.png, canada images, ocean.jpg are NOT blog images). For the frontmatter `images` field of `telescopios.mdx`, this references a non-blog image -- could be left as-is or handled specially.
**Warning signs:** Featured image thumbnails broken for `telescopios.mdx`.

### Pitfall 5: Date-Path Mismatch in Some Posts
**What goes wrong:** Post `C2021A1LeonardVisible.mdx` lives at `data/blog/2021/12/17/` but has `date: 2021-12-27`. Its images are at `public/static/images/blog/2021/12/27/` (matching the date, not the file path).
**Why it happens:** Author placed the file in the wrong date folder but pointed images to the correct date folder.
**How to avoid:** Use the filesystem path as the slug (preserving existing URLs). Image paths from content references already point to the correct location in the filesystem. The slug will be `2021/12/17/C2021A1LeonardVisible` (from filesystem), not `2021/12/27/...` (from date).
**Warning signs:** Rendering works but metadata shows unexpected date/path mismatch.

### Pitfall 6: Missing `S3_IMAGES_BUCKET_NAME` Environment Variable
**What goes wrong:** The env template only has `S3_ARTICLES_BUCKET_NAME`. There is no `S3_IMAGES_BUCKET_NAME` yet.
**Why it happens:** Phase 19 only set up the articles bucket. Image bucket is a Phase 21 addition.
**How to avoid:** Add `S3_IMAGES_BUCKET_NAME` to `.env.template` and document it. The migration script must validate this env var exists before starting.
**Warning signs:** Migration fails with "bucket not configured" error.

### Pitfall 7: `examples/` Posts with Non-Standard Structure
**What goes wrong:** The `data/blog/examples/` directory contains 10 template/example posts (all `draft: true`) that reference non-blog images, use nested routes, and have non-standard slugs like `examples/code-sample`.
**Why it happens:** These are starter template posts, not real SAC content.
**How to avoid:** Decision: Include them in migration (CONTEXT says "migrate everything including drafts") but accept that their non-blog image references won't be rewritten (images like `/static/images/ocean.jpg` and `/static/images/canada/*` are not in `public/static/images/blog/`).
**Warning signs:** Example posts have broken images after migration (acceptable since they're drafts and not real content).

## Code Examples

### Parsing MDX Frontmatter with gray-matter
```javascript
// gray-matter 4.0.3 - already in project
const matter = require('gray-matter');
const fs = require('fs');

const source = fs.readFileSync('data/blog/2025/08/21/post.mdx', 'utf8');
const { data: frontmatter, content } = matter(source);

// frontmatter = { title, date, lastmod, tags, draft, summary, images, imgWidth, imgHeight, authors }
// content = raw MDX body (everything after the --- frontmatter delimiter)
```

### Deriving Slug from Filesystem Path
```javascript
const path = require('path');

function deriveSlug(filePath, blogRoot) {
  // filePath: 'c:/path/data/blog/2017/04/13/PlanetaDosSoles04132017.mdx'
  // blogRoot: 'c:/path/data/blog'
  const relative = path.relative(blogRoot, filePath).replace(/\\/g, '/');
  return relative.replace(/\.(mdx|md)$/, '');
  // Result: '2017/04/13/PlanetaDosSoles04132017'
}
```

### Building Article JSON from MDX
```javascript
const { ARTICLE_FIELDS, INDEX_FIELDS } = require('../lib/articles');

function buildArticleJSON(frontmatter, content, slug) {
  return {
    title: frontmatter.title,
    date: frontmatter.date instanceof Date ? frontmatter.date.toISOString() : frontmatter.date,
    lastmod: frontmatter.lastmod || frontmatter.date,
    tags: frontmatter.tags || [],
    summary: frontmatter.summary || '',
    content: content, // Raw MDX body, preserved exactly as-is
    images: frontmatter.images || [],
    imgWidth: frontmatter.imgWidth || null,
    imgHeight: frontmatter.imgHeight || null,
    authors: frontmatter.authors || [],
    draft: frontmatter.draft !== undefined ? frontmatter.draft : false,
    archived: frontmatter.archived !== undefined ? frontmatter.archived : false,
    slug: slug,
  };
}
```

### Image Reference Rewriting with Regex
```javascript
function rewriteImageRefs(content, s3BaseUrl) {
  // Pattern 1: src={'/static/images/blog/...'} (JSX expression, single quotes)
  // Pattern 2: src="/static/images/blog/..." (JSX attribute, double quotes)
  // Pattern 3: src={"/static/images/blog/..."} (JSX expression, double quotes)
  // Pattern 4: ![alt](/static/images/blog/...) (Markdown image)

  // Replace /static/images/blog/ with S3 URL
  // Must handle paths with spaces (URL-encode for S3)
  let rewritten = content;

  // JSX patterns: src={'/static/images/blog/...'} and src={"/static/images/blog/..."}
  rewritten = rewritten.replace(
    /src=\{['"]\/static\/images\/blog\/([^'"]+)['"]\}/g,
    (match, imgPath) => `src="${s3BaseUrl}/images/blog/${imgPath}"`
  );

  // JSX attribute: src="/static/images/blog/..."
  rewritten = rewritten.replace(
    /src="\/static\/images\/blog\/([^"]+)"/g,
    (match, imgPath) => `src="${s3BaseUrl}/images/blog/${imgPath}"`
  );

  // Markdown: ![alt](/static/images/blog/...)
  rewritten = rewritten.replace(
    /!\[([^\]]*)\]\(\/static\/images\/blog\/([^)]+)\)/g,
    (match, alt, imgPath) => `![${alt}](${s3BaseUrl}/images/blog/${imgPath})`
  );

  return rewritten;
}
```

### Rewriting Frontmatter Images Field
```javascript
function rewriteFrontmatterImages(images, s3BaseUrl) {
  if (!images || !Array.isArray(images)) return images;
  return images.map(img => {
    if (!img) return img;
    // Frontmatter images typically lack leading /: 'static/images/blog/...'
    const normalized = img.startsWith('/') ? img.slice(1) : img;
    if (normalized.startsWith('static/images/blog/')) {
      const imgPath = normalized.replace('static/images/blog/', '');
      return `${s3BaseUrl}/images/blog/${imgPath}`;
    }
    return img; // Leave non-blog images unchanged
  });
}
```

### Uploading Image to S3
```javascript
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.jfif': 'image/jpeg',
};

async function uploadImage(s3, bucket, localPath, s3Key) {
  const ext = path.extname(localPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const body = fs.readFileSync(localPath);

  await s3.putObject({
    Bucket: bucket,
    Key: s3Key,
    Body: body,
    ContentType: contentType,
  }).promise();
}
```

### Bulk Index Build
```javascript
const { putArticleIndex } = require('../lib/articles-s3');
const { INDEX_FIELDS } = require('../lib/articles');

async function buildAndUploadIndex(articles) {
  const indexArticles = articles.map(article => {
    const entry = {};
    for (const field of INDEX_FIELDS) {
      if (article[field] !== undefined) {
        entry[field] = article[field];
      }
    }
    return entry;
  });

  // Sort newest-first
  indexArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  await putArticleIndex({
    articles: indexArticles,
    updatedAt: new Date().toISOString(),
  });
}
```

## Codebase Inventory (Content to Migrate)

### Blog Posts
| Category | Count | Notes |
|----------|-------|-------|
| Total MDX/MD files | 77 | In `data/blog/` |
| Published posts | 63 | `draft: false`, `archived: false` or undefined |
| Draft posts | 13 | `draft: true` (1 non-example + 12 examples) |
| Archived posts | 1 | `archived: true` |
| Example/template posts | 10 | In `data/blog/examples/`, all `draft: true` |
| Root-level posts | 1 | `telescopios.mdx` (no date-path folder) |

### Frontmatter Field Coverage
| Field | Present In | Notes |
|-------|-----------|-------|
| title | 77/77 (100%) | Always present |
| date | 77/77 (100%) | Always present; formats vary: ISO string, quoted date |
| tags | 77/77 (100%) | Always present |
| draft | 77/77 (100%) | Always present |
| summary | 77/77 (100%) | Always present (1 example has empty value) |
| lastmod | 69/77 (90%) | Missing from 8 posts |
| images | 69/77 (90%) | Missing from 8 posts; some have empty array or empty string |
| imgWidth | 66/77 (86%) | Missing from 11 posts |
| imgHeight | 66/77 (86%) | Missing from 11 posts |
| authors | 69/77 (90%) | Missing from 8 posts |
| archived | 2/77 (3%) | Only 2 posts have this field |
| layout | 1/77 (1%) | Only in example posts; NOT in ARTICLE_FIELDS |

### Blog Images
| Metric | Value |
|--------|-------|
| Total image files | 215 |
| Total size | ~133 MB |
| File types | .jpg (193), .png (8), .gif (7), .webp (5), .jfif (2) |
| Files with spaces in name | 28 |
| In `telescope_guide/` subfolder | 7 |
| Non-date-path images | 7 (telescope_guide/) |

### Image Reference Patterns in Content
| Pattern | Example | Frequency |
|---------|---------|-----------|
| `src={'/static/images/blog/...'}` | JSX expression, single quotes | Most common (older posts) |
| `src="/static/images/blog/..."` | JSX attribute, double quotes | Common (newer posts) |
| `src={"/static/images/blog/..."}` | JSX expression, double quotes | Rare (1 occurrence) |
| `![alt](/static/images/blog/...)` | Markdown image syntax | Only in example posts |
| Frontmatter `images: ['static/...']` | No leading `/` | 67 posts (without leading /) |
| Frontmatter `images: ['/static/...']` | With leading `/` | 1 post (with leading /) |

### Custom Components Used
| Component | Usage Count | Notes |
|-----------|-------------|-------|
| `<Image>` | Nearly all posts | With width/height attributes |
| `<ImageCaption>` | Many posts | Caption below images |
| `<ResponsiveReactPlayer>` | 28 uses in 23 posts | YouTube video embeds - NOT image references |

### Edge Cases
| Edge Case | Details |
|-----------|---------|
| `telescopios.mdx` | Root-level post (no date-path folder); references `static/images/telescope_color.png` (NOT in blog images); date `2000-01-01` |
| `examples/` posts | 10 template posts referencing non-blog images (`canada/`, `ocean.jpg`, etc.) |
| `C2021A1LeonardVisible` | File at `2021/12/17/` but `date: 2021-12-27`; images at `2021/12/27/` |
| Empty `images` field | `GaleriaNeowise.mdx` has `images: ['']`; some have `images:` with multi-line YAML |
| `nested-route/` | `examples/nested-route/introducing-multi-part-posts-with-nested-routing.md` |
| External image refs | `MeteoritoNewYersey.mdx` has a CBS video embed src (not an image to migrate) |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| aws-sdk v2 (single package) | @aws-sdk/client-s3 v3 (modular) | 2020 | Project uses v2; migration script should match existing code |
| MDX content from filesystem | MDX content from S3 JSON | Phase 19-20 | Migration bridges the gap |
| Images in `public/static/` | Images in S3 public bucket | Phase 21 | Direct S3 URLs replace `/static/images/` paths |

**Note:** The project uses aws-sdk v2 (2.1692.0) everywhere. Phase 19's `articles-s3.js` and the gallery API both use v2. The migration script should use v2 for consistency. No migration to v3 needed.

## Discretion Recommendations

### MDX Parsing Library: gray-matter
**Recommendation:** Use `gray-matter` (already installed at 4.0.3).
**Reasoning:** It's already used by `lib/mdx.js` in the project. It cleanly separates frontmatter from content with `matter(source)` returning `{ data, content }`. No additional parsing libraries needed since we preserve MDX content as-is (no AST transformation).

### Image Upload Strategy: Parallel with Concurrency Limit of 10
**Recommendation:** Upload images with up to 10 concurrent uploads using a simple promise pool.
**Reasoning:** 215 images at ~133 MB total. Sequential uploads would be slow. A concurrency limit of 10 balances speed with not overwhelming the network/S3 rate limits. Simple implementation with a promise pool (no external library needed).

```javascript
async function uploadWithConcurrency(tasks, limit = 10) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().then(r => { executing.delete(p); return r; });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}
```

### Progress Reporting: Per-Image and Per-Article with Summary
**Recommendation:** Log each image and article as it's processed. Show running count: `[42/215] Uploaded images/blog/2022/07/11/0711.jpg`. At end, show summary with totals and timing.

### Dry-Run Preview Format
**Recommendation:** In dry-run mode, output a structured report:
1. List of posts to migrate (slug, title, draft status)
2. List of images to upload (local path -> S3 key)
3. Image reference patterns detected per post
4. Missing images that would cause fail-fast
5. Summary counts

### Migration Log File Format
**Recommendation:** JSON Lines (`.jsonl`) log file at `scripts/migration-log-TIMESTAMP.jsonl`. Each line is a JSON object with: `{ timestamp, action, type, source, destination, status, error? }`. This is easily parseable for verification.

### Spot-Check List Posts
**Recommendation:** Output these 5 posts for manual review:
1. **Oldest post:** `2017/04/13/PlanetaDosSoles04132017` (single image, simple content)
2. **Newest post:** `2025/08/21/siete-cometas-tendran-un-leve-acercamiento-a-la-tierra` (4 images, spaces in filenames)
3. **Post with video embeds:** `2024/11/26/Starship_Electrophonic_Sound` (3 ResponsiveReactPlayer + images)
4. **Post with complex layout:** `telescopios` (7 inline images, HTML/JSX layout, non-standard slug)
5. **Post with many images:** `2019/10/07/Saturn20` (3 images + 1 GIF + video)

## Open Questions

1. **Should `examples/` posts be migrated?**
   - What we know: CONTEXT says "migrate everything - published, draft, archived." Examples are all `draft: true`.
   - What's unclear: They reference non-blog images that won't be in S3 (canada, ocean, etc.). Their slugs are non-standard (`examples/code-sample`).
   - Recommendation: **Include them** (they're drafts, CONTEXT says migrate drafts), but log warnings for non-blog image references that can't be rewritten. Accept broken images in example posts.

2. **How should `telescopios.mdx` frontmatter `images` field be handled?**
   - What we know: It references `static/images/telescope_color.png` which is NOT in `public/static/images/blog/`. The inline `<Image>` components reference `static/images/blog/telescope_guide/*` which ARE in the blog images folder.
   - What's unclear: Should the frontmatter `images` reference be left pointing to the old path, changed to point to the S3 version, or removed?
   - Recommendation: Leave the frontmatter `images` reference unchanged since `telescope_color.png` is not a blog image and won't be migrated. The inline image references to `telescope_guide/*` WILL be rewritten since those images ARE in `public/static/images/blog/`.

3. **How to handle the `rebuildArticleIndex()` reference in CONTEXT?**
   - What we know: No `rebuildArticleIndex()` function exists in the codebase. There is `rebuildIndexEntry()` (per-article incremental) and `putArticleIndex()` (write raw index data).
   - Recommendation: Implement bulk index build in the migration script using `putArticleIndex()` directly. This is effectively what `rebuildArticleIndex()` would do -- build the full index from all migrated articles and write it once.

4. **S3 URL format for images with spaces in filenames?**
   - What we know: S3 keys CAN contain spaces. When constructing public URLs, the path must be URL-encoded. Format: `https://bucket.s3.amazonaws.com/images/blog/2025/08/21/Comet%20C%202025%20A6%20Lemmon.jpg`
   - Recommendation: Store the S3 key with spaces as-is (mirrors filesystem). When constructing the URL for article content, each path segment should be URI-encoded. Use a helper function that splits the path on `/`, encodes each segment, and joins with `/`.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** - `lib/articles-s3.js`, `lib/articles.js`, `lib/mdx.js`, `pages/api/photos.js` (project source code)
- **Codebase analysis** - All 77 blog posts analyzed for frontmatter patterns, image references, edge cases
- **gray-matter 4.0.3** - Installed and in use in project at `lib/mdx.js` line 3
- **aws-sdk 2.1692.0** - Installed and in use in project at `lib/articles-s3.js` and `pages/api/photos.js`

### Secondary (MEDIUM confidence)
- **Phase 19 CONTEXT.md** - Article JSON shape, index structure, S3 key layout decisions
- **Phase 20 CONTEXT.md** - Blog rendering approach, data source transition, slug format
- **scripts/import-legacy-gallery-into-s3/uploader.py** - Prior art for S3 migration in project

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use in the project
- Architecture: HIGH - patterns derived from existing codebase analysis and Phase 19/20 decisions
- Content inventory: HIGH - all 77 posts and 215 images analyzed programmatically
- Pitfalls: HIGH - edge cases discovered through systematic codebase analysis
- Image patterns: HIGH - all 4 reference patterns confirmed through grep analysis

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain - migration is one-time)
