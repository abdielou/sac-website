#!/usr/bin/env node
/**
 * Content-level fixes for the article corpus in S3.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 * Every write is preceded by a full backup of the affected objects.
 *
 *   node scripts/seo/fix-article-data.mjs                    # show everything it would do
 *   node scripts/seo/fix-article-data.mjs --tags             # dry run, just the tag backfill
 *   node scripts/seo/fix-article-data.mjs --tags --apply     # actually write
 *   node scripts/seo/fix-article-data.mjs --all --apply      # everything
 *
 * Fixes, each independently selectable. --all runs the first four plus
 * --drop-examples; the two marked OPT-IN are excluded from it by decision.
 *   --tags            backfill tags on published articles that have none
 *   --tag-case        collapse tag case variants (Eclipse -> eclipse, Saturno -> saturno)
 *   --titles          strip stray ' ; ' and doubled spaces from titles
 *   --lastmod         expand bare-date lastmod to ISO and clamp it to >= date
 *   --drop-examples   delete the starter-template example drafts
 *   --dates           OPT-IN. The telescope guide's 2000-01-01 date. Declined:
 *                     the PO considers it fine as it stands.
 *   --archive-stubs   OPT-IN. Archive published articles with no prose. Declined:
 *                     the Artemis II live-coverage post stays published.
 *
 * Writes go straight to S3 rather than through lib/articles.js updateArticle(),
 * because that helper unconditionally stamps lastmod = now. For a metadata
 * repair that would tell Google all 77 articles changed today, which is false.
 * The tag backfill DOES bump lastmod, because those articles genuinely changed.
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

// Explicit credentials: a stale ~/.aws/credentials otherwise wins the default
// provider chain and every request fails with InvalidAccessKeyId.
const s3 = new AWS.S3({
  endpoint: env.AWS_S3_ENDPOINT || undefined,
  s3ForcePathStyle: true,
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
})

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const ALL = argv.includes('--all')

/**
 * Reviewed and declined by the PO on 2026-08-24, so --all must not sweep them up.
 * Both still run if named explicitly, should that decision ever change.
 *
 *   --dates          the telescope guide's 2000-01-01 date is fine as it stands
 *   --archive-stubs  the Artemis II live-coverage post stays published
 */
const EXCLUDED_FROM_ALL = new Set(['--dates', '--archive-stubs'])

const want = (flag) => (ALL && !EXCLUDED_FROM_ALL.has(flag)) || argv.includes(flag)

const KEY = (slug) => `articles/${slug}.json`
const INDEX_KEY = 'articles/index.json'

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

/**
 * Tag backfill for published articles that currently have none.
 * Every value below is drawn from the vocabulary already in use, so these
 * articles join existing hubs rather than creating new single-use tag pages.
 */
const TAG_BACKFILL = {
  '2026/08/21/captan-desde-la-isla-cambios-en-la-cola-y-apariencia-del-cometa-220p': [
    'cometa',
    'avistamiento',
    'puerto rico',
  ],
  '2026/08/15/brillante-meteoro-de-otra-lluvia-poco-conocida': ['meteoro', 'avistamiento'],
  '2026/08/15/desde-isabela-pr-espectacular-foto-del-cometa-220p-mcnaught': [
    'cometa',
    'avistamiento',
    'puerto rico',
  ],
  '2026/08/11/lluvia-de-meteoros-perseidas': ['meteoro', 'perseidas'],
  '2026/08/08/cometa-220p-mcnaught-sorprende-al-convertirse-en-el-mas-brillante-del-momento': [
    'cometa',
  ],
  '2026/08/06/primeras-imagenes-del-instante-del-impacto-de-un-cohete-en-la-luna': [
    'luna',
    'cohete',
    'impacto',
  ],
  '2026/08/05/observatorios-detectaron-el-impacto-de-cohete-en-la-luna': [
    'luna',
    'cohete',
    'impacto',
  ],
  '2026/08/04/visible-o-no-el-impacto-de-un-cohete-en-la-luna': ['luna', 'cohete', 'impacto'],
  '2026/04/05/en-vivo-cobertura-de-artemis-ii-de-regreso-a-la-luna': ['luna', 'lanzamiento'],
}

/** The telescope guide carries a placeholder date that sorts it last of 77. */
const DATE_FIXES = {
  // Keep the slug: it is already indexed and linked from the site nav.
  telescopios: '2024-01-15T08:00:00.000Z',
}

const cleanTitle = (t) =>
  String(t)
    .replace(/\s+;\s+/g, ': ')
    .replace(/\s{2,}/g, ' ')
    .trim()

/**
 * Collapse case and whitespace variants only.
 *
 * Accents are deliberately PRESERVED: tag text is rendered to Spanish readers on
 * the tag pages and under every article, and 'bolido' for 'bólido' is simply
 * misspelled. De-accenting belongs in the URL slug, which lib/utils/kebabCase.js
 * handles, not in the stored display text.
 */
const normaliseTag = (t) => String(t).trim().replace(/\s+/g, ' ').toLowerCase()

const plan = []
const record = (kind, slug, before, after, note) => plan.push({ kind, slug, before, after, note })

const main = async () => {
  const index = await getJSON(INDEX_KEY)
  const entries = index.articles || []

  const slugs = entries.map((e) => e.slug)
  const articles = new Map()
  process.stderr.write(`Reading ${slugs.length} articles...\n`)
  for (const slug of slugs) {
    try {
      articles.set(slug, await getJSON(KEY(slug)))
    } catch (e) {
      process.stderr.write(`  ! unreadable: ${slug} (${e.message})\n`)
    }
  }

  const touched = new Map()
  const mutate = (slug, fn) => {
    const current = touched.get(slug) || { ...articles.get(slug) }
    fn(current)
    touched.set(slug, current)
  }

  // --- tags -----------------------------------------------------------------
  if (want('--tags')) {
    for (const [slug, tags] of Object.entries(TAG_BACKFILL)) {
      const a = articles.get(slug)
      if (!a) {
        record('tags', slug, null, null, 'SKIPPED: article not found in the index')
        continue
      }
      if (Array.isArray(a.tags) && a.tags.length > 0) {
        record('tags', slug, a.tags, a.tags, 'SKIPPED: already tagged')
        continue
      }
      record('tags', slug, a.tags ?? [], tags, 'bumps lastmod (content genuinely changed)')
      mutate(slug, (x) => {
        x.tags = tags
        x.lastmod = new Date().toISOString()
      })
    }
  }

  // --- tag case -------------------------------------------------------------
  if (want('--tag-case')) {
    for (const [slug, a] of articles) {
      if (!Array.isArray(a.tags) || a.tags.length === 0) continue
      const next = [...new Set(a.tags.map(normaliseTag))].filter(Boolean)
      if (JSON.stringify(next) !== JSON.stringify(a.tags)) {
        record('tag-case', slug, a.tags, next, 'lastmod preserved')
        mutate(slug, (x) => {
          x.tags = next
        })
      }
    }
  }

  // --- titles ---------------------------------------------------------------
  if (want('--titles')) {
    for (const [slug, a] of articles) {
      const next = cleanTitle(a.title)
      if (next !== a.title) {
        record('title', slug, a.title, next, 'lastmod preserved')
        mutate(slug, (x) => {
          x.title = next
        })
      }
    }
  }

  // --- lastmod --------------------------------------------------------------
  if (want('--lastmod')) {
    for (const [slug, a] of articles) {
      if (!a.date) continue
      const pub = new Date(a.date)
      const raw = a.lastmod
      const mod = raw ? new Date(raw) : pub
      const fixed = (Number.isNaN(mod.getTime()) || mod < pub ? pub : mod).toISOString()
      if (fixed !== raw) {
        record('lastmod', slug, raw ?? null, fixed, 'metadata repair, not a content change')
        mutate(slug, (x) => {
          x.lastmod = fixed
        })
      }
    }
  }

  // --- dates ----------------------------------------------------------------
  if (want('--dates')) {
    for (const [slug, date] of Object.entries(DATE_FIXES)) {
      const a = articles.get(slug)
      if (!a) {
        record('date', slug, null, null, 'SKIPPED: not found')
        continue
      }
      if (a.date === date) continue
      record('date', slug, a.date, date, 'slug preserved, URL unchanged')
      mutate(slug, (x) => {
        x.date = date
      })
    }
  }

  // --- archive stubs --------------------------------------------------------
  if (want('--archive-stubs')) {
    for (const [slug, a] of articles) {
      if (a.draft === true || a.archived === true) continue
      const prose = String(a.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[#>*`_~-]/g, ' ')
        .trim()
      if (prose.length === 0) {
        record('archive', slug, 'published', 'archived', 'zero words of prose')
        mutate(slug, (x) => {
          x.archived = true
        })
      }
    }
  }

  // --- drop examples --------------------------------------------------------
  const toDelete = []
  if (want('--drop-examples')) {
    for (const slug of slugs) {
      if (String(slug).startsWith('examples/')) {
        toDelete.push(slug)
        record('delete', slug, 'in index', 'deleted', 'starter-template draft')
      }
    }
  }

  // --- report ---------------------------------------------------------------
  if (plan.length === 0 && toDelete.length === 0) {
    console.log('\nNothing to do. Pass one of --tags --tag-case --titles --lastmod --dates')
    console.log('--archive-stubs --drop-examples, or --all.\n')
    return
  }

  const byKind = {}
  for (const p of plan) byKind[p.kind] = (byKind[p.kind] || 0) + 1

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'}  bucket=${BUCKET}\n`)
  for (const [k, n] of Object.entries(byKind)) console.log(`  ${String(n).padStart(4)}  ${k}`)
  console.log('')

  for (const p of plan) {
    if (p.note?.startsWith('SKIPPED')) {
      console.log(`  - ${p.kind}  ${p.slug}\n      ${p.note}`)
      continue
    }
    console.log(`  * ${p.kind}  ${p.slug}`)
    if (p.kind === 'title') {
      console.log(`      before: ${JSON.stringify(p.before)}`)
      console.log(`      after:  ${JSON.stringify(p.after)}`)
    } else if (p.before !== null || p.after !== null) {
      console.log(`      ${JSON.stringify(p.before)} -> ${JSON.stringify(p.after)}`)
    }
    if (p.note) console.log(`      (${p.note})`)
  }
  console.log('')

  if (!APPLY) {
    console.log(`${touched.size} article objects would be rewritten, ${toDelete.length} deleted.`)
    console.log('Re-run with --apply to write. A backup is taken first.\n')
    return
  }

  // --- backup ---------------------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.resolve(process.cwd(), `.planning/seo/backups/${stamp}`)
  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(path.join(backupDir, 'index.json'), JSON.stringify(index, null, 2))
  for (const slug of [...touched.keys(), ...toDelete]) {
    const original = articles.get(slug)
    if (!original) continue
    const file = path.join(backupDir, `${slug.replace(/\//g, '__')}.json`)
    fs.writeFileSync(file, JSON.stringify(original, null, 2))
  }
  console.log(`Backup written to ${backupDir}`)

  // --- write ----------------------------------------------------------------
  let written = 0
  for (const [slug, article] of touched) {
    await putJSON(KEY(slug), article)
    written++
  }
  for (const slug of toDelete) {
    await s3.deleteObject({ Bucket: BUCKET, Key: KEY(slug) }).promise()
  }

  // --- rebuild the index ----------------------------------------------------
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
  const deleted = new Set(toDelete)
  const nextEntries = entries
    .filter((e) => !deleted.has(e.slug))
    .map((e) => {
      const updated = touched.get(e.slug)
      if (!updated) return e
      const out = {}
      for (const f of INDEX_FIELDS) if (updated[f] !== undefined) out[f] = updated[f]
      return out
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  await putJSON(INDEX_KEY, { articles: nextEntries, updatedAt: new Date().toISOString() })

  console.log(`\nWrote ${written} articles, deleted ${toDelete.length}, rebuilt the index.`)
  console.log('Revalidation: the blog routes use revalidate = 3600, so allow an hour')
  console.log('or trigger on-demand revalidation from the admin UI.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
