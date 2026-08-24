#!/usr/bin/env node
/**
 * Seed weak image alt text from the caption that already follows each image.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. A backup is taken first.
 *
 *   node scripts/seo/backfill-alt-text.mjs
 *   node scripts/seo/backfill-alt-text.mjs --apply
 *   node scripts/seo/backfill-alt-text.mjs --max-len 120
 *
 * Article bodies use this shape:
 *   <Image alt="Leonard" ... />
 *   <ImageCaption>Cometa C/2021 A1 (Leonard) pasando frente a la Galaxia ...</ImageCaption>
 *
 * Every alt is a terse subject label while the caption right beside it is a full
 * Spanish description. This rewrites only alts judged WEAK, and only where a
 * caption is actually present. It never invents text.
 *
 * An alt is weak when it is empty, shorter than 15 characters, looks like a
 * filename, or repeats verbatim on three or more images in the same article.
 */
import fs from 'node:fs'
import path from 'node:path'
import AWS from 'aws-sdk'

const envPath = path.resolve(process.cwd(), '.env')
const env = {}
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BUCKET = env.S3_ARTICLES_BUCKET_NAME
if (!BUCKET) {
  console.error('S3_ARTICLES_BUCKET_NAME is not set. Check .env.')
  process.exit(1)
}

const s3 = new AWS.S3({
  endpoint: env.AWS_S3_ENDPOINT || undefined,
  s3ForcePathStyle: true,
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
})

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const MAX_LEN = Number(argv[argv.indexOf('--max-len') + 1]) || 125

const KEY = (slug) => `articles/${slug}.json`
const getJSON = async (Key) =>
  JSON.parse((await s3.getObject({ Bucket: BUCKET, Key }).promise()).Body.toString())
const putJSON = (Key, data) =>
  s3
    .putObject({
      Bucket: BUCKET,
      Key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    })
    .promise()

const FILENAME = /^[\w-]+\.(png|jpe?g|gif|webp|svg)$/i
const NUMERIC = /^\d+$/
const SEQUENCED = /^[a-z]+\d+$/i

/** Strip MDX/JSX and markdown out of a caption, leaving readable prose. */
const captionText = (raw) =>
  String(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A caption that is only a photo credit describes the source, not the picture,
 * so it makes a poor alt. Detect and reject those: they need a human.
 */
const CREDIT_PREFIX = /^(foto|fotos|crédito|credito|créditos|creditos|fuente|source)\s*:/i
const isCreditOnly = (text) => {
  if (!CREDIT_PREFIX.test(text)) return false
  const rest = text.replace(CREDIT_PREFIX, '').trim()
  // A real description continues past the source name with a lowercase clause.
  return rest.split(/\s+/).length <= 8 && !/\s(que|con|durante|desde|muestra|captad)/i.test(rest)
}

/** First sentence, or a word-boundary truncation, capped at MAX_LEN. */
const toAlt = (caption) => {
  const text = captionText(caption)
  if (!text) return null
  if (isCreditOnly(text)) return null
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]
  const base = firstSentence.length >= 20 && firstSentence.length <= MAX_LEN ? firstSentence : text
  if (base.length <= MAX_LEN) return base.replace(/\s*[.;,]$/, '')
  const cut = base.slice(0, MAX_LEN)
  const at = cut.lastIndexOf(' ')
  return (at > 40 ? cut.slice(0, at) : cut).replace(/\s*[.;,]$/, '')
}

const main = async () => {
  const index = await getJSON('articles/index.json')
  const slugs = (index.articles || []).map((a) => a.slug)

  process.stderr.write(`Reading ${slugs.length} articles...\n`)

  const changes = []
  const updated = new Map()

  for (const slug of slugs) {
    let article
    try {
      article = await getJSON(KEY(slug))
    } catch {
      continue
    }
    const body = String(article.content || '')
    if (!body.includes('<Image')) continue

    // Count alt repetition within this article, to catch the "Leonard" x21 case.
    const altCounts = {}
    for (const m of body.matchAll(/<Image\b[^>]*\balt="([^"]*)"/g)) {
      altCounts[m[1]] = (altCounts[m[1]] || 0) + 1
    }

    const isWeak = (alt) =>
      !alt ||
      alt.trim().length < 15 ||
      FILENAME.test(alt) ||
      NUMERIC.test(alt) ||
      SEQUENCED.test(alt) ||
      altCounts[alt] >= 3

    let next = body
    let localChanges = 0

    // Match an Image immediately followed by its ImageCaption.
    const pairRe = /(<Image\b[^>]*?\balt=")([^"]*)("[^>]*?\/>)(\s*<ImageCaption>)([\s\S]*?)(<\/ImageCaption>)/g

    next = next.replace(pairRe, (full, pre, alt, post, capOpen, capBody, capClose) => {
      if (!isWeak(alt)) return full
      const proposed = toAlt(capBody)
      if (!proposed || proposed.length < 15) return full
      if (proposed === alt) return full
      localChanges++
      changes.push({ slug, before: alt, after: proposed })
      return `${pre}${proposed.replace(/"/g, '&quot;')}${post}${capOpen}${capBody}${capClose}`
    })

    if (localChanges > 0) {
      updated.set(slug, { ...article, content: next })
    }
  }

  if (changes.length === 0) {
    console.log('\nNo weak alt text with an adjacent caption was found.\n')
    return
  }

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'}  bucket=${BUCKET}`)
  console.log(`${changes.length} alt attributes across ${updated.size} articles\n`)

  let current = null
  for (const c of changes) {
    if (c.slug !== current) {
      current = c.slug
      console.log(`  ${c.slug}`)
    }
    console.log(`    ${JSON.stringify(c.before)}`)
    console.log(`      -> ${JSON.stringify(c.after)}`)
  }
  console.log('')

  if (!APPLY) {
    console.log('Re-run with --apply to write. A backup is taken first.\n')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.resolve(process.cwd(), `.planning/seo/backups/alt-${stamp}`)
  fs.mkdirSync(backupDir, { recursive: true })
  for (const slug of updated.keys()) {
    const original = await getJSON(KEY(slug))
    fs.writeFileSync(
      path.join(backupDir, `${slug.replace(/\//g, '__')}.json`),
      JSON.stringify(original, null, 2)
    )
  }
  console.log(`Backup written to ${backupDir}`)

  for (const [slug, article] of updated) {
    await putJSON(KEY(slug), article)
  }

  // The index does not carry content, so it needs no rebuild here.
  console.log(`\nRewrote ${updated.size} articles.`)
  console.log('Allow up to an hour for revalidate = 3600, or revalidate on demand.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
