#!/usr/bin/env node
/**
 * Full snapshot of the article corpus in S3, and restore from one.
 *
 * The fix scripts back up only the objects they touch. This takes everything,
 * so a restore point does not depend on the fix script having correctly
 * predicted its own blast radius.
 *
 *   node scripts/seo/snapshot-articles.mjs --profile abdiel-root
 *   node scripts/seo/snapshot-articles.mjs --profile abdiel-root --verify <dir>
 *   node scripts/seo/snapshot-articles.mjs --profile abdiel-root --restore <dir>
 *
 * --restore is deliberately noisy and requires --confirm, because it overwrites
 * live articles with whatever the snapshot holds.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createS3, whoAmI, assertWritable } from './s3-client.mjs'

const { s3, bucket: BUCKET, region, source, credentials } = createS3()
const argv = process.argv.slice(2)

const flagValue = (name) => {
  const i = argv.indexOf(name)
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

const VERIFY_DIR = flagValue('--verify')
const RESTORE_DIR = flagValue('--restore')
const CONFIRM = argv.includes('--confirm')

const INDEX_KEY = 'articles/index.json'
const KEY = (slug) => `articles/${slug}.json`
/** S3 keys contain slashes; the filesystem copy flattens them. */
const fileFor = (slug) => `${String(slug).replace(/\//g, '__')}.json`

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

/** Every article key the index knows about, plus the index itself. */
async function readCorpus() {
  const index = await getJSON(INDEX_KEY)
  const entries = index.articles || []
  const articles = new Map()
  const failed = []

  for (const entry of entries) {
    try {
      articles.set(entry.slug, await getJSON(KEY(entry.slug)))
    } catch (error) {
      failed.push({ slug: entry.slug, error: error.message })
    }
  }
  return { index, entries, articles, failed }
}

async function snapshot() {
  const { index, entries, articles, failed } = await readCorpus()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.resolve(process.cwd(), `.planning/seo/backups/snapshot-${stamp}`)
  fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2))
  for (const [slug, article] of articles) {
    fs.writeFileSync(path.join(dir, fileFor(slug)), JSON.stringify(article, null, 2))
  }

  const manifest = {
    takenAt: new Date().toISOString(),
    bucket: BUCKET,
    indexEntries: entries.length,
    articlesSaved: articles.size,
    failed,
    slugs: [...articles.keys()].sort(),
  }
  fs.writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))

  console.log(`\nSnapshot written to ${dir}`)
  console.log(`  ${articles.size} articles + index.json (${entries.length} index entries)`)
  if (failed.length > 0) {
    console.log(`  ! ${failed.length} unreadable:`)
    for (const f of failed) console.log(`      ${f.slug}: ${f.error}`)
  }
  console.log(`\nVerify:  node scripts/seo/snapshot-articles.mjs --verify ${dir}`)
  console.log(`Restore: node scripts/seo/snapshot-articles.mjs --restore ${dir} --confirm\n`)
  return dir
}

/** Re-read S3 and diff it against a snapshot, so a restore point can be trusted. */
async function verify(dir) {
  const manifestPath = path.join(dir, 'MANIFEST.json')
  if (!fs.existsSync(manifestPath)) {
    console.error(`No MANIFEST.json in ${dir}`)
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const { articles } = await readCorpus()

  let identical = 0
  const differs = []
  const missingLocally = []

  for (const [slug, live] of articles) {
    const file = path.join(dir, fileFor(slug))
    if (!fs.existsSync(file)) {
      missingLocally.push(slug)
      continue
    }
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (JSON.stringify(saved) === JSON.stringify(live)) identical += 1
    else differs.push(slug)
  }

  console.log(`\nVerifying ${dir}`)
  console.log(`  manifest says   : ${manifest.articlesSaved} articles`)
  console.log(`  live now        : ${articles.size} articles`)
  console.log(`  byte-identical  : ${identical}`)
  console.log(`  differ from live: ${differs.length}`)
  console.log(`  not in snapshot : ${missingLocally.length}`)
  if (differs.length > 0) for (const s of differs.slice(0, 20)) console.log(`      differs: ${s}`)
  if (missingLocally.length > 0) for (const s of missingLocally) console.log(`      missing: ${s}`)

  const clean = differs.length === 0 && missingLocally.length === 0
  console.log(
    clean
      ? '\nSnapshot matches live exactly. Safe restore point.\n'
      : '\nSnapshot does NOT match live. Expected if changes landed after it was taken.\n'
  )
  return clean
}

async function restore(dir) {
  if (!CONFIRM) {
    console.error(`\nRestore would overwrite live articles from ${dir}`)
    console.error('Re-run with --confirm to proceed.\n')
    process.exit(1)
  }
  const { writable, reason } = await assertWritable(s3, BUCKET)
  if (!writable) {
    console.error(`\nCannot write to ${BUCKET}: ${reason}\n`)
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8'))
  let restored = 0
  for (const slug of manifest.slugs) {
    const file = path.join(dir, fileFor(slug))
    if (!fs.existsSync(file)) continue
    await putJSON(KEY(slug), JSON.parse(fs.readFileSync(file, 'utf8')))
    restored += 1
  }
  await putJSON(INDEX_KEY, JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')))

  console.log(`\nRestored ${restored} articles and the index from ${dir}`)
  console.log('Articles created after the snapshot are left untouched, not deleted.\n')
}

const main = async () => {
  console.log(`\nCredentials: ${source}  (${await whoAmI({ credentials, region })})`)
  console.log(`Bucket     : ${BUCKET}`)

  if (VERIFY_DIR) return void (await verify(VERIFY_DIR))
  if (RESTORE_DIR) return void (await restore(RESTORE_DIR))
  await snapshot()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
