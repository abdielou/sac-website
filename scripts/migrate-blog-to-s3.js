#!/usr/bin/env node

/**
 * migrate-blog-to-s3.js
 *
 * One-time migration script that reads all existing MDX/MD blog posts and images
 * from the filesystem, transforms them to JSON format, rewrites image references
 * to S3 URLs, and uploads everything to S3.
 *
 * Usage:
 *   node scripts/migrate-blog-to-s3.js --dry-run   # Preview all changes
 *   node scripts/migrate-blog-to-s3.js --live       # Execute migration
 */

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOG_ROOT = path.resolve(__dirname, '..', 'data', 'blog')
const IMAGES_ROOT = path.resolve(__dirname, '..', 'public', 'static', 'images', 'blog')

const REQUIRED_FRONTMATTER = ['title', 'date', 'tags', 'draft', 'summary']

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.jfif': 'image/jpeg',
}

const IMAGE_EXTENSIONS = new Set(Object.keys(MIME_TYPES))

const CONCURRENCY_LIMIT = 10

const INDEX_FIELDS = [
  'title',
  'date',
  'lastmod',
  'tags',
  'summary',
  'images',
  'imgWidth',
  'imgHeight',
  'authors',
  'draft',
  'archived',
  'slug',
]

const SPOT_CHECK_LIST = [
  { slug: '2017/04/13/PlanetaDosSoles04132017', label: 'Oldest' },
  {
    slug: '2025/08/21/siete-cometas-tendran-un-leve-acercamiento-a-la-tierra',
    label: 'Newest',
  },
  { slug: '2024/11/26/Starship_Electrophonic_Sound', label: 'Video embeds' },
  { slug: 'telescopios', label: 'Complex layout' },
  { slug: '2019/10/07/Saturn20', label: 'Many images' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a directory and return all file paths.
 */
function walkDir(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Encode an S3 URL with proper URI encoding for each path segment.
 * Handles filenames with spaces.
 */
function encodeS3Url(bucketName, s3Key) {
  const segments = s3Key.split('/')
  const encoded = segments.map((seg) => encodeURIComponent(seg)).join('/')
  return `https://${bucketName}.s3.amazonaws.com/${encoded}`
}

/**
 * Run async tasks with a concurrency limit (promise pool).
 */
async function runWithConcurrency(tasks, limit) {
  const results = []
  const executing = new Set()
  for (const task of tasks) {
    const p = task().then((r) => {
      executing.delete(p)
      return r
    })
    executing.add(p)
    results.push(p)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

/**
 * Derive slug from filesystem path relative to BLOG_ROOT.
 */
function deriveSlug(filePath) {
  const relative = path.relative(BLOG_ROOT, filePath).replace(/\\/g, '/')
  return relative.replace(/\.(mdx|md)$/, '')
}

/**
 * Create a JSONL log writer.
 */
function createLogWriter(logPath, mode) {
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  return {
    log(entry) {
      stream.write(JSON.stringify({ ...entry, mode, timestamp: new Date().toISOString() }) + '\n')
    },
    close() {
      stream.end()
    },
  }
}

// ---------------------------------------------------------------------------
// Phase 0: Discovery
// ---------------------------------------------------------------------------

function discoverPosts() {
  const allFiles = walkDir(BLOG_ROOT)
  return allFiles.filter((f) => /\.(mdx|md)$/.test(f))
}

function discoverImages() {
  const allFiles = walkDir(IMAGES_ROOT)
  return allFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase()
    return IMAGE_EXTENSIONS.has(ext)
  })
}

/**
 * Compute image s3Key from its local path.
 * Example: public/static/images/blog/2022/07/photo.jpg -> images/blog/2022/07/photo.jpg
 */
function imageS3Key(localPath) {
  const relative = path.relative(IMAGES_ROOT, localPath).replace(/\\/g, '/')
  return `images/blog/${relative}`
}

// ---------------------------------------------------------------------------
// Phase 1: Image Upload
// ---------------------------------------------------------------------------

async function uploadImages(imagePaths, s3, bucketName, isLive, logger) {
  const imageEntries = imagePaths.map((localPath) => ({
    localPath,
    s3Key: imageS3Key(localPath),
  }))

  const total = imageEntries.length
  let count = 0

  if (!isLive) {
    // Dry-run: group images by top-level folder and report
    const byFolder = {}
    for (const entry of imageEntries) {
      const parts = entry.s3Key.split('/')
      // images/blog/YYYY/MM/... -> use YYYY/MM as folder key
      const folder = parts.length >= 4 ? `${parts[2]}/${parts[3]}` : parts[2] || 'root'
      byFolder[folder] = (byFolder[folder] || 0) + 1
    }

    console.log('\n--- Phase 1: Images to upload ---')
    console.log(`Total images: ${total}`)
    console.log('\nBy folder:')
    for (const [folder, cnt] of Object.entries(byFolder).sort()) {
      console.log(`  ${folder}: ${cnt} images`)
    }

    for (const entry of imageEntries) {
      logger.log({
        action: 'image_upload',
        type: 'image',
        source: entry.localPath,
        destination: entry.s3Key,
        status: 'would_migrate',
      })
    }

    console.log(`\nPhase 1 complete (dry-run): ${total} images would be uploaded`)
    return
  }

  // Live mode: upload with concurrency
  console.log(`\n--- Phase 1: Uploading ${total} images ---`)

  const tasks = imageEntries.map((entry) => async () => {
    const ext = path.extname(entry.localPath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const body = fs.readFileSync(entry.localPath)

    try {
      await s3
        .putObject({
          Bucket: bucketName,
          Key: entry.s3Key,
          Body: body,
          ContentType: contentType,
        })
        .promise()

      count++
      console.log(`[${count}/${total}] Uploaded ${entry.s3Key}`)
      logger.log({
        action: 'image_upload',
        type: 'image',
        source: entry.localPath,
        destination: entry.s3Key,
        status: 'success',
      })
    } catch (error) {
      logger.log({
        action: 'image_upload',
        type: 'image',
        source: entry.localPath,
        destination: entry.s3Key,
        status: 'error',
        error: error.message,
      })
      throw new Error(`Failed to upload image ${entry.s3Key}: ${error.message}`)
    }
  })

  await runWithConcurrency(tasks, CONCURRENCY_LIMIT)
  console.log(`\nPhase 1 complete: ${total}/${total} images uploaded`)
}

// ---------------------------------------------------------------------------
// Phase 2: Article Processing
// ---------------------------------------------------------------------------

/**
 * Rewrite image references in MDX content.
 * Handles all four patterns:
 *   1. src={'/static/images/blog/...'}  (JSX expression, single quotes)
 *   2. src="/static/images/blog/..."    (JSX attribute, double quotes)
 *   3. src={"/static/images/blog/..."}  (JSX expression, double quotes)
 *   4. ![alt](/static/images/blog/...)   (Markdown image)
 */
function rewriteContentImageRefs(content, imagesBucketName) {
  let rewritten = content
  const refsFound = []

  // Pattern 1: src={'/static/images/blog/...'}
  rewritten = rewritten.replace(
    /src=\{'\/static\/images\/blog\/([^']+)'\}/g,
    (match, imgPath) => {
      refsFound.push(imgPath)
      const s3Key = `images/blog/${imgPath}`
      return `src="${encodeS3Url(imagesBucketName, s3Key)}"`
    }
  )

  // Pattern 3: src={"/static/images/blog/..."} (must come before pattern 2 to avoid overlap)
  rewritten = rewritten.replace(
    /src=\{"\/static\/images\/blog\/([^"]+)"\}/g,
    (match, imgPath) => {
      refsFound.push(imgPath)
      const s3Key = `images/blog/${imgPath}`
      return `src="${encodeS3Url(imagesBucketName, s3Key)}"`
    }
  )

  // Pattern 2: src="/static/images/blog/..." (plain JSX attribute)
  rewritten = rewritten.replace(
    /src="\/static\/images\/blog\/([^"]+)"/g,
    (match, imgPath) => {
      refsFound.push(imgPath)
      const s3Key = `images/blog/${imgPath}`
      return `src="${encodeS3Url(imagesBucketName, s3Key)}"`
    }
  )

  // Pattern 4: ![alt](/static/images/blog/...)
  rewritten = rewritten.replace(
    /!\[([^\]]*)\]\(\/static\/images\/blog\/([^)]+)\)/g,
    (match, alt, imgPath) => {
      refsFound.push(imgPath)
      const s3Key = `images/blog/${imgPath}`
      return `![${alt}](${encodeS3Url(imagesBucketName, s3Key)})`
    }
  )

  return { rewritten, refsFound }
}

/**
 * Rewrite frontmatter images array.
 * Only rewrites entries starting with static/images/blog/ or /static/images/blog/.
 * Non-blog images are left unchanged.
 */
function rewriteFrontmatterImages(images, imagesBucketName) {
  if (!images || !Array.isArray(images)) return { rewritten: images || [], blogRefs: [] }

  const blogRefs = []
  const rewritten = images.map((img) => {
    if (!img) return img
    const normalized = img.startsWith('/') ? img.slice(1) : img
    if (normalized.startsWith('static/images/blog/')) {
      const imgPath = normalized.replace('static/images/blog/', '')
      blogRefs.push(imgPath)
      const s3Key = `images/blog/${imgPath}`
      return encodeS3Url(imagesBucketName, s3Key)
    }
    return img // Leave non-blog images unchanged
  })

  return { rewritten, blogRefs }
}

/**
 * Extract all /static/images/blog/ references from content for missing-image checking.
 * Returns array of relative image paths (after /static/images/blog/).
 */
function extractBlogImageRefs(content) {
  const refs = []

  // Pattern 1: src={'/static/images/blog/...'}
  const p1 = /src=\{'\/static\/images\/blog\/([^']+)'\}/g
  let m
  while ((m = p1.exec(content)) !== null) refs.push(m[1])

  // Pattern 2: src="/static/images/blog/..."
  const p2 = /src="\/static\/images\/blog\/([^"]+)"/g
  while ((m = p2.exec(content)) !== null) refs.push(m[1])

  // Pattern 3: src={"/static/images/blog/..."}
  const p3 = /src=\{"\/static\/images\/blog\/([^"]+)"\}/g
  while ((m = p3.exec(content)) !== null) refs.push(m[1])

  // Pattern 4: ![alt](/static/images/blog/...)
  const p4 = /!\[[^\]]*\]\(\/static\/images\/blog\/([^)]+)\)/g
  while ((m = p4.exec(content)) !== null) refs.push(m[1])

  return refs
}

/**
 * Process all articles: parse, validate, rewrite image refs, build JSON.
 * Returns array of article JSON objects ready for upload.
 */
function processArticles(postPaths, imagesBucketName) {
  const articles = []
  let patternCounts = { p1: 0, p2: 0, p3: 0, p4: 0 }

  for (const filePath of postPaths) {
    const source = fs.readFileSync(filePath, 'utf8')
    const { data: frontmatter, content } = matter(source)
    const slug = deriveSlug(filePath)

    // Validate required frontmatter
    for (const field of REQUIRED_FRONTMATTER) {
      if (frontmatter[field] === undefined) {
        throw new Error(
          `Missing required frontmatter field "${field}" in ${slug} (${filePath})`
        )
      }
    }

    // Count image reference patterns
    const p1Matches = (content.match(/src=\{'\/static\/images\/blog\//g) || []).length
    const p2Matches = (content.match(/src="\/static\/images\/blog\//g) || []).length
    const p3Matches = (content.match(/src=\{"\/static\/images\/blog\//g) || []).length
    const p4Matches = (content.match(/!\[[^\]]*\]\(\/static\/images\/blog\//g) || []).length
    patternCounts.p1 += p1Matches
    patternCounts.p2 += p2Matches
    patternCounts.p3 += p3Matches
    patternCounts.p4 += p4Matches

    // Check for missing images (blog images only)
    const blogImageRefs = extractBlogImageRefs(content)
    for (const ref of blogImageRefs) {
      const localImagePath = path.join(IMAGES_ROOT, ref)
      if (!fs.existsSync(localImagePath)) {
        throw new Error(
          `Missing image in article "${slug}": /static/images/blog/${ref} (expected at ${localImagePath})`
        )
      }
    }

    // Also check frontmatter images for blog refs
    if (Array.isArray(frontmatter.images)) {
      for (const img of frontmatter.images) {
        if (!img) continue
        const normalized = img.startsWith('/') ? img.slice(1) : img
        if (normalized.startsWith('static/images/blog/')) {
          const imgPath = normalized.replace('static/images/blog/', '')
          const localImagePath = path.join(IMAGES_ROOT, imgPath)
          if (!fs.existsSync(localImagePath)) {
            throw new Error(
              `Missing frontmatter image in article "${slug}": ${img} (expected at ${localImagePath})`
            )
          }
        }
      }
    }

    // Rewrite image references in content
    const { rewritten: rewrittenContent } = rewriteContentImageRefs(content, imagesBucketName)

    // Rewrite frontmatter images
    const { rewritten: rewrittenImages } = rewriteFrontmatterImages(
      frontmatter.images,
      imagesBucketName
    )

    // Build article JSON
    const article = {
      title: frontmatter.title,
      date:
        frontmatter.date instanceof Date
          ? frontmatter.date.toISOString()
          : String(frontmatter.date),
      lastmod: frontmatter.lastmod
        ? frontmatter.lastmod instanceof Date
          ? frontmatter.lastmod.toISOString()
          : String(frontmatter.lastmod)
        : null,
      tags: frontmatter.tags || [],
      summary: frontmatter.summary || '',
      content: rewrittenContent,
      images: rewrittenImages,
      imgWidth: frontmatter.imgWidth || null,
      imgHeight: frontmatter.imgHeight || null,
      authors: frontmatter.authors || [],
      draft: frontmatter.draft !== undefined ? frontmatter.draft : false,
      archived: frontmatter.archived !== undefined ? frontmatter.archived : false,
      slug: slug,
    }

    articles.push(article)
  }

  return { articles, patternCounts }
}

/**
 * Upload articles to S3.
 */
async function uploadArticles(articles, s3, bucketName, isLive, logger) {
  const total = articles.length

  if (!isLive) {
    console.log('\n--- Phase 2: Posts to migrate ---')
    console.log('')
    console.log(
      `${'Slug'.padEnd(70)} | ${'Title'.padEnd(50)} | Draft`
    )
    console.log('-'.repeat(130))
    for (const article of articles) {
      const titleTrunc =
        article.title.length > 50 ? article.title.slice(0, 47) + '...' : article.title
      console.log(
        `${article.slug.padEnd(70)} | ${titleTrunc.padEnd(50)} | ${article.draft}`
      )
      logger.log({
        action: 'article_migrate',
        type: 'article',
        source: article.slug,
        destination: `articles/${article.slug}.json`,
        status: 'would_migrate',
        details: { title: article.title, draft: article.draft },
      })
    }
    console.log(`\nPhase 2 complete (dry-run): ${total} articles would be migrated`)
    return
  }

  // Live mode
  console.log(`\n--- Phase 2: Migrating ${total} articles ---`)

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]
    const key = `articles/${article.slug}.json`

    try {
      await s3
        .putObject({
          Bucket: bucketName,
          Key: key,
          Body: JSON.stringify(article, null, 2),
          ContentType: 'application/json',
        })
        .promise()

      console.log(`[${i + 1}/${total}] Migrated ${article.slug}`)
      logger.log({
        action: 'article_migrate',
        type: 'article',
        source: article.slug,
        destination: key,
        status: 'success',
      })
    } catch (error) {
      logger.log({
        action: 'article_migrate',
        type: 'article',
        source: article.slug,
        destination: key,
        status: 'error',
        error: error.message,
      })
      throw new Error(`Failed to upload article ${article.slug}: ${error.message}`)
    }
  }

  console.log(`\nPhase 2 complete: ${total}/${total} articles migrated`)
}

// ---------------------------------------------------------------------------
// Phase 3: Index Build
// ---------------------------------------------------------------------------

async function buildIndex(articles, s3, bucketName, isLive, logger) {
  // Extract index fields from each article
  const indexArticles = articles.map((article) => {
    const entry = {}
    for (const field of INDEX_FIELDS) {
      if (article[field] !== undefined) {
        entry[field] = article[field]
      }
    }
    return entry
  })

  // Sort newest-first by date
  indexArticles.sort((a, b) => new Date(b.date) - new Date(a.date))

  const indexData = {
    articles: indexArticles,
    updatedAt: new Date().toISOString(),
  }

  if (!isLive) {
    console.log('\n--- Phase 3: Index ---')
    console.log(`Index would contain ${indexArticles.length} entries`)
    console.log(`Newest: ${indexArticles[0]?.slug || 'N/A'}`)
    console.log(`Oldest: ${indexArticles[indexArticles.length - 1]?.slug || 'N/A'}`)

    // Count drafts vs published
    const drafts = indexArticles.filter((a) => a.draft === true).length
    const published = indexArticles.length - drafts
    console.log(`Published: ${published}, Drafts: ${drafts}`)

    logger.log({
      action: 'index_build',
      type: 'index',
      source: 'collected metadata',
      destination: 'articles/index.json',
      status: 'would_migrate',
      details: { entryCount: indexArticles.length },
    })

    console.log(`\nPhase 3 complete (dry-run): index would contain ${indexArticles.length} entries`)
    return
  }

  // Live mode
  console.log(`\n--- Phase 3: Building index ---`)

  try {
    await s3
      .putObject({
        Bucket: bucketName,
        Key: 'articles/index.json',
        Body: JSON.stringify(indexData, null, 2),
        ContentType: 'application/json',
      })
      .promise()

    console.log(`Index uploaded with ${indexArticles.length} entries`)
    logger.log({
      action: 'index_build',
      type: 'index',
      source: 'collected metadata',
      destination: 'articles/index.json',
      status: 'success',
      details: { entryCount: indexArticles.length },
    })
  } catch (error) {
    logger.log({
      action: 'index_build',
      type: 'index',
      source: 'collected metadata',
      destination: 'articles/index.json',
      status: 'error',
      error: error.message,
    })
    throw new Error(`Failed to upload index: ${error.message}`)
  }

  console.log(`\nPhase 3 complete: index built with ${indexArticles.length} entries`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now()

  // Parse CLI args
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const isLive = args.includes('--live')

  if (!isDryRun && !isLive) {
    console.error('Usage: node scripts/migrate-blog-to-s3.js [--dry-run | --live]')
    console.error('')
    console.error('  --dry-run  Preview all changes without uploading to S3')
    console.error('  --live     Execute the actual migration')
    process.exit(1)
  }

  const mode = isDryRun ? 'dry-run' : 'live'
  console.log(`\n========================================`)
  console.log(`  Blog Migration to S3 (${mode})`)
  console.log(`========================================\n`)

  // Validate env vars (only for live mode)
  if (isLive) {
    const requiredEnv = [
      'S3_ARTICLES_BUCKET_NAME',
      'S3_IMAGES_BUCKET_NAME',
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ]
    const missing = requiredEnv.filter((v) => !process.env[v])
    if (missing.length > 0) {
      console.error(`Missing required environment variables: ${missing.join(', ')}`)
      process.exit(1)
    }
  }

  // For image URL rewriting, we need the bucket name even in dry-run
  const imagesBucketName = process.env.S3_IMAGES_BUCKET_NAME || 'DRY_RUN_IMAGES_BUCKET'
  const articlesBucketName = process.env.S3_ARTICLES_BUCKET_NAME || 'DRY_RUN_ARTICLES_BUCKET'

  // Create S3 client (only for live mode)
  let imagesS3 = null
  let articlesS3 = null
  if (isLive) {
    const AWS = require('aws-sdk')
    // Images S3 client — no custom endpoint, goes to real S3
    imagesS3 = new AWS.S3({ region: process.env.AWS_REGION })
    // Articles S3 client — respects AWS_S3_ENDPOINT for localstack
    articlesS3 = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: !!process.env.AWS_S3_ENDPOINT,
      region: process.env.AWS_REGION,
    })
  }

  // Create log file
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
  const logPath = path.resolve(__dirname, `migration-log-${timestamp}.jsonl`)
  const logger = createLogWriter(logPath, mode)

  logger.log({
    action: 'migration_start',
    type: 'system',
    source: BLOG_ROOT,
    destination: `s3://${articlesBucketName}`,
    status: 'started',
    details: { mode },
  })

  // Phase 0: Discovery
  console.log('--- Phase 0: Discovery ---')
  const postPaths = discoverPosts()
  const imagePaths = discoverImages()
  console.log(`Found ${postPaths.length} posts, ${imagePaths.length} images`)

  // Phase 1: Image Upload
  await uploadImages(imagePaths, imagesS3, imagesBucketName, isLive, logger)

  // Phase 2: Article Processing
  console.log('\nProcessing articles...')
  const { articles, patternCounts } = processArticles(postPaths, imagesBucketName)
  await uploadArticles(articles, articlesS3, articlesBucketName, isLive, logger)

  // Show image reference pattern summary
  console.log('\nImage reference patterns detected:')
  console.log(`  Pattern 1 (src={'/path'}):  ${patternCounts.p1} occurrences`)
  console.log(`  Pattern 2 (src="/path"):     ${patternCounts.p2} occurrences`)
  console.log(`  Pattern 3 (src={"/path"}):   ${patternCounts.p3} occurrences`)
  console.log(`  Pattern 4 (![alt](/path)):    ${patternCounts.p4} occurrences`)

  // Phase 3: Index Build
  await buildIndex(articles, articlesS3, articlesBucketName, isLive, logger)

  // Final summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  logger.log({
    action: 'migration_complete',
    type: 'system',
    source: BLOG_ROOT,
    destination: `s3://${articlesBucketName}`,
    status: mode === 'dry-run' ? 'would_migrate' : 'success',
    details: {
      posts: postPaths.length,
      images: imagePaths.length,
      indexEntries: articles.length,
      duration: `${duration}s`,
    },
  })

  logger.close()

  console.log('\n========================================')
  console.log(`  Migration ${isDryRun ? 'Preview' : 'Complete'}!`)
  console.log('========================================')
  console.log(`  - Posts migrated: ${articles.length}`)
  console.log(`  - Images uploaded: ${imagePaths.length}`)
  console.log(`  - Index entries: ${articles.length}`)
  console.log(`  - Duration: ${duration}s`)
  console.log(`  - Log file: ${logPath}`)
  console.log('')

  // Spot-check list
  console.log('Posts to manually spot-check:')
  SPOT_CHECK_LIST.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.label}: /blog/${item.slug}`)
  })
  console.log('')
}

main().catch((err) => {
  console.error('\nMIGRATION FAILED:', err.message)
  process.exit(1)
})
