#!/usr/bin/env node
/**
 * Read-only audit of the article corpus in S3.
 *
 * Reports the content-level problems the Aug 2026 SEO audit found, against live
 * data, so the fix script has an accurate work list. Writes nothing.
 *
 *   node scripts/seo/audit-article-data.mjs
 *   node scripts/seo/audit-article-data.mjs --json > corpus.json
 */
import fs from 'node:fs'
import path from 'node:path'
import AWS from 'aws-sdk'

// Minimal .env reader: this script runs outside Next, which normally injects these.
// Credentials are passed to the SDK EXPLICITLY rather than through process.env,
// because a stale ~/.aws/credentials otherwise wins the default provider chain
// and the request fails with InvalidAccessKeyId.
const envPath = path.resolve(process.cwd(), '.env')
const env = {}
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BUCKET = env.S3_ARTICLES_BUCKET_NAME || process.env.S3_ARTICLES_BUCKET_NAME
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

const getJSON = async (Key) => {
  const r = await s3.getObject({ Bucket: BUCKET, Key }).promise()
  return JSON.parse(r.Body.toString())
}

const WORD = /\S+/g
const stripMdx = (s = '') =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*`_~-]/g, ' ')

const main = async () => {
  const index = await getJSON('articles/index.json')
  const entries = index.articles || []
  const published = entries.filter((a) => a.draft !== true && a.archived !== true)

  process.stderr.write(`Fetching ${published.length} published articles...\n`)

  const articles = []
  for (const entry of published) {
    try {
      articles.push(await getJSON(`articles/${entry.slug}.json`))
    } catch (e) {
      process.stderr.write(`  ! failed: ${entry.slug} (${e.message})\n`)
    }
  }

  const report = {
    bucket: BUCKET,
    generatedAt: new Date().toISOString(),
    totals: {
      indexEntries: entries.length,
      published: published.length,
      drafts: entries.filter((a) => a.draft === true).length,
      archived: entries.filter((a) => a.archived === true).length,
      fetched: articles.length,
    },
    untagged: [],
    longTitles: [],
    longSummaries: [],
    shortSummaries: [],
    whitespaceArtifacts: [],
    bareDateLastmod: [],
    modifiedBeforePublished: [],
    thinContent: [],
    noHeadings: [],
    suspectDates: [],
    weakAlt: [],
    exampleDrafts: entries.filter((a) => String(a.slug).startsWith('examples/')).map((a) => a.slug),
    tagUsage: {},
    tagCaseVariants: {},
  }

  for (const a of articles) {
    const slug = a.slug
    const title = a.title || ''
    const summary = a.summary || ''
    const body = a.content || ''

    if (!Array.isArray(a.tags) || a.tags.length === 0) {
      report.untagged.push({ slug, title, date: a.date })
    } else {
      for (const t of a.tags) {
        const key = String(t).trim()
        const lower = key.toLowerCase()
        report.tagUsage[lower] = (report.tagUsage[lower] || 0) + 1
        report.tagCaseVariants[lower] = report.tagCaseVariants[lower] || new Set()
        report.tagCaseVariants[lower].add(key)
      }
    }

    // The root template appends ' | SAC', so the rendered title is 6 chars longer.
    const rendered = title.length + 6
    if (rendered > 60) report.longTitles.push({ slug, chars: rendered, title })
    if (summary.length > 160) report.longSummaries.push({ slug, chars: summary.length, summary })
    if (summary.length > 0 && summary.length < 70)
      report.shortSummaries.push({ slug, chars: summary.length, summary })
    if (/\s;\s|\s{2,}/.test(title)) report.whitespaceArtifacts.push({ slug, title })

    if (a.lastmod && /^\d{4}-\d{2}-\d{2}$/.test(String(a.lastmod))) {
      report.bareDateLastmod.push({ slug, lastmod: a.lastmod, date: a.date })
    }
    if (a.lastmod && a.date && new Date(a.lastmod) < new Date(a.date)) {
      report.modifiedBeforePublished.push({ slug, lastmod: a.lastmod, date: a.date })
    }

    const words = (stripMdx(body).match(WORD) || []).length
    if (words < 300) report.thinContent.push({ slug, words, title })
    if (!/^#{2,3}\s/m.test(body)) report.noHeadings.push({ slug, words, title })

    const year = new Date(a.date).getUTCFullYear()
    if (year < 2010) report.suspectDates.push({ slug, date: a.date, title })

    // Slug carries a YYYY/MM/DD prefix; flag when it contradicts the stored date.
    const m = String(slug).match(/^(\d{4})\/(\d{2})\/(\d{2})\//)
    if (m) {
      const fromSlug = `${m[1]}-${m[2]}-${m[3]}`
      const fromDate = new Date(a.date).toISOString().slice(0, 10)
      if (fromSlug !== fromDate) {
        report.suspectDates.push({ slug, date: a.date, slugDate: fromSlug, title, drift: true })
      }
    }

    for (const im of body.matchAll(/alt=["']([^"']*)["']/g)) {
      const alt = im[1]
      if (!alt || alt.length < 15 || /^[\w-]+\.(png|jpe?g|gif|webp)$/i.test(alt)) {
        report.weakAlt.push({ slug, alt })
      }
    }
  }

  for (const k of Object.keys(report.tagCaseVariants)) {
    const variants = [...report.tagCaseVariants[k]]
    report.tagCaseVariants[k] = variants.length > 1 ? variants : undefined
    if (!report.tagCaseVariants[k]) delete report.tagCaseVariants[k]
  }

  report.singleUseTags = Object.entries(report.tagUsage)
    .filter(([, n]) => n === 1)
    .map(([t]) => t)

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const line = (label, n, extra = '') =>
    console.log(`  ${String(n).padStart(4)}  ${label}${extra ? `  ${extra}` : ''}`)

  console.log(`\nArticle corpus audit  (bucket: ${BUCKET})\n`)
  console.log(
    `  ${report.totals.published} published, ${report.totals.drafts} drafts, ${report.totals.archived} archived\n`
  )
  line('published articles with no tags', report.untagged.length)
  line('rendered titles over 60 chars', report.longTitles.length)
  line('summaries over 160 chars', report.longSummaries.length)
  line('summaries under 70 chars', report.shortSummaries.length)
  line('titles with stray whitespace or " ; "', report.whitespaceArtifacts.length)
  line('bare-date lastmod values', report.bareDateLastmod.length)
  line('dateModified before datePublished', report.modifiedBeforePublished.length)
  line('articles under 300 words', report.thinContent.length)
  line('articles with no h2/h3 in the body', report.noHeadings.length)
  line('suspect or drifting dates', report.suspectDates.length)
  line('weak or filename alt attributes', report.weakAlt.length)
  line('starter-template example drafts', report.exampleDrafts.length)
  line('distinct tags', Object.keys(report.tagUsage).length)
  line('tags used exactly once', report.singleUseTags.length)
  line('tags with case variants', Object.keys(report.tagCaseVariants).length)

  if (report.untagged.length) {
    console.log('\nUntagged published articles:')
    for (const a of report.untagged) console.log(`  ${a.date?.slice(0, 10)}  ${a.slug}`)
  }
  if (Object.keys(report.tagCaseVariants).length) {
    console.log('\nTag case variants:')
    for (const [k, v] of Object.entries(report.tagCaseVariants))
      console.log(`  ${k}: ${v.join(', ')}`)
  }
  if (report.suspectDates.length) {
    console.log('\nSuspect dates:')
    for (const a of report.suspectDates)
      console.log(`  ${a.slug}  date=${a.date}${a.slugDate ? ` slug=${a.slugDate}` : ''}`)
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
