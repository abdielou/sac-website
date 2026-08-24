import { listGuides, getGuide } from '@/lib/guides'
import { getObjectById } from '@/lib/catalog'
import hubbleImages from '@/data/catalog/hubble-images.json'
import { absUrl, pageMetadata, noindexMetadata, safeModified, toIso } from '@/lib/seo'

/**
 * Server-side guide edition helpers.
 *
 * Lives beside the public guides route because both the JSON endpoint and the
 * server-rendered guide pages must resolve editions and catalog data the exact
 * same way. Everything here reaches S3 through `@/lib/guides`, so it is
 * server-only: never import it from a `'use client'` module.
 */

/** Per-type copy. `objects` is the monthly guide, `galaxies` the seasonal one. */
export const GUIDE_TYPES = {
  objects: {
    type: 'objects',
    sectionTitle: 'Objetos del mes',
    indexTitle: 'Objetos del mes',
    titlePrefix: 'Guía de observación',
    subject: 'objetos del cielo profundo',
  },
  galaxies: {
    type: 'galaxies',
    sectionTitle: 'Galaxias de la temporada',
    indexTitle: 'Galaxias de la temporada',
    titlePrefix: 'Guía de galaxias',
    subject: 'galaxias',
  },
}

/** Render order of the type sections on the index page. */
export const GUIDE_TYPE_ORDER = ['objects', 'galaxies']

const DEFAULT_TYPE = GUIDE_TYPES.objects

/** Resolve the copy block for a guide type, falling back to the monthly guide. */
export function guideTypeConfig(type) {
  return GUIDE_TYPES[type] ?? DEFAULT_TYPE
}

/** Site-relative path of one edition. One URL per edition, keyed by its stored slug. */
export function editionPath(slug) {
  return `/guides/${String(slug ?? '').replace(/^\/+/, '')}`
}

function stripAccents(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** True when the editor already wrote a full phrase, e.g. 'Guia de galaxias enanas'. */
function alreadyPhrased(title) {
  return /^guia\b/i.test(stripAccents(title).trim())
}

/**
 * Number of objects in an edition. The S3 index carries `entryCount`; the full
 * guide document carries `entries`.
 */
export function editionEntryCount(guide) {
  if (Array.isArray(guide?.entries)) return guide.entries.length
  const count = Number(guide?.entryCount)
  return Number.isFinite(count) && count > 0 ? count : 0
}

/**
 * Search-legible title for an edition.
 *
 * Editors store bare month names ('Febrero 2026'), which say nothing on their
 * own in a result listing. The stored title is never mutated: only the rendered
 * and indexed heading gains the topic prefix.
 */
export function editionTitle(guide) {
  const raw = String(guide?.title ?? '').trim()
  const config = guideTypeConfig(guide?.type)
  if (!raw) return config.titlePrefix
  if (alreadyPhrased(raw)) return raw
  return `${config.titlePrefix}: ${raw}`
}

function capitalize(value) {
  const text = String(value)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Meta description for an edition, built from its own data. */
export function editionDescription(guide) {
  const config = guideTypeConfig(guide?.type)
  const count = editionEntryCount(guide)
  const raw = String(guide?.title ?? '').trim()
  const subject = count > 0 ? `${count} ${config.subject}` : config.subject
  const when = raw && !alreadyPhrased(raw) ? ` de ${raw}` : ''
  return `${capitalize(subject)}${when} con magnitud, dificultad, equipo recomendado y hora óptima desde Puerto Rico y el Caribe.`
}

/**
 * Metadata export for `/guides/<slug>`, with a self-referencing canonical.
 * The root layout template appends the site name, so the title omits it.
 */
export function editionMetadata(guide) {
  const openGraph = { type: 'article' }
  if (guide?.publishedAt) {
    openGraph.publishedTime = toIso(guide.publishedAt)
    openGraph.modifiedTime = safeModified(guide.publishedAt, guide.updatedAt)
  }

  return pageMetadata({
    title: editionTitle(guide),
    description: editionDescription(guide),
    path: editionPath(guide?.slug),
    openGraph,
  })
}

/** Metadata for a slug that resolves to nothing. Kept out of the index. */
export function missingEditionMetadata(slug) {
  return noindexMetadata({
    title: 'Guía no encontrada',
    description: 'Esta guía de observación no existe o todavía no se ha publicado.',
    path: editionPath(slug),
  })
}

/** Format an edition date for display. Returns '' when missing or unparseable. */
export function formatEditionDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Index-shaped summary of one edition, safe to pass into a client component. */
export function toEditionSummary(guide) {
  return {
    slug: guide.slug,
    type: guide.type ?? DEFAULT_TYPE.type,
    rawTitle: String(guide.title ?? '').trim(),
    title: editionTitle(guide),
    path: editionPath(guide.slug),
    publishedAt: guide.publishedAt ?? null,
    entryCount: editionEntryCount(guide),
  }
}

const byPublishedDesc = (a, b) =>
  new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()

/**
 * Every published edition, newest first. Never throws: an unconfigured or
 * unreachable S3 degrades to an empty list so the build and the page still work.
 */
export async function listPublishedEditions() {
  try {
    const { guides } = await listGuides()
    return (guides ?? [])
      .filter((guide) => guide && guide.slug && guide.status === 'published')
      .map(toEditionSummary)
      .sort(byPublishedDesc)
  } catch (error) {
    console.error('Error loading guide editions:', error?.message)
    return []
  }
}

/** Group edition summaries by guide type, preserving the incoming order. */
export function groupEditionsByType(editions = []) {
  const grouped = {}
  for (const type of GUIDE_TYPE_ORDER) grouped[type] = []
  for (const edition of editions) {
    const type = grouped[edition.type] ? edition.type : DEFAULT_TYPE.type
    grouped[type].push(edition)
  }
  return grouped
}

/**
 * Load one published edition by slug. Returns null for an unknown slug, a draft
 * or an S3 failure, so callers can answer with a 404 instead of a 500.
 */
export async function getPublishedEdition(slug) {
  if (!slug) return null

  let guide
  try {
    guide = await getGuide(slug)
  } catch {
    return null
  }

  if (!guide || guide.status !== 'published') return null
  return guide
}

/** Display name of a resolved entry, Spanish common name first. */
export function entryDisplayName(entry) {
  const catalog = entry?.catalog
  if (!catalog) return entry?.objectId ?? ''
  return catalog.commonNameEs || catalog.commonName || catalog.name || entry?.objectId || ''
}

/**
 * Resolve one stored entry against the object catalog and the ESA/Hubble image
 * map. Grayscale SkyView art is filled in at render time from the coordinates.
 */
export function resolveGuideEntry(entry) {
  const catalogObj = getObjectById(entry.objectId)
  const hubbleId = hubbleImages[entry.objectId]
  const imageUrl = hubbleId
    ? `https://cdn.esahubble.org/archives/images/thumb700x/${hubbleId}.jpg`
    : null

  return {
    objectId: entry.objectId,
    difficulty: entry.difficulty || null,
    equipment: entry.equipment || null,
    location: entry.location || null,
    optimalTime: entry.optimalTime || null,
    notes: entry.notes || null,
    catalog: catalogObj || null,
    imageUrl,
  }
}

/** Resolve every entry of a guide. This is what gets server-rendered. */
export function resolveGuideEntries(guide) {
  return (guide?.entries ?? []).map(resolveGuideEntry)
}

function entryFacts(entry) {
  const parts = []
  const catalog = entry?.catalog
  if (catalog?.constellation) parts.push(`Constelación: ${catalog.constellation}`)
  if (catalog?.magnitude != null) parts.push(`Magnitud ${catalog.magnitude}`)
  if (entry?.optimalTime) parts.push(`Hora óptima: ${entry.optimalTime}`)
  return parts.join(' · ')
}

/**
 * ItemList structured data for one edition. The object list is the only
 * first-party dataset on the site, so it is worth describing explicitly.
 */
export function editionItemListSchema(guide, entries = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: editionTitle(guide),
    description: editionDescription(guide),
    url: absUrl(editionPath(guide?.slug)),
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => {
      const facts = entryFacts(entry)
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: entryDisplayName(entry),
        ...(facts ? { description: facts } : {}),
      }
    }),
  }
}
