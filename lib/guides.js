import {
  putGuideJSON,
  getGuideJSON,
  deleteGuideJSON,
  getGuideIndex,
  putGuideIndex,
} from './guides-s3.js'

/**
 * Generate a URL-safe slug from a title string.
 * Removes diacritics, lowercases, replaces non-alphanumeric with hyphens,
 * and appends a timestamp suffix for uniqueness.
 */
function generateSlug(title) {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric to hyphens
    .replace(/-{2,}/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens

  return `${base}-${Date.now()}`
}

/**
 * List all guides from the index, sorted by updatedAt descending.
 * @returns {Promise<{guides: Array}>}
 */
export async function listGuides() {
  const index = await getGuideIndex()
  const guides = (index.guides || []).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return { guides }
}

/**
 * Get a single guide by slug.
 * @param {string} slug
 * @returns {Promise<Object>} Full guide object
 */
export async function getGuide(slug) {
  return getGuideJSON(slug)
}

/**
 * Create a new guide.
 * @param {Object} data - { title (required), type (required), entries?, author? }
 * @returns {Promise<Object>} The created guide
 */
export async function createGuide(data) {
  if (!data.title || !data.title.trim()) {
    throw new Error('Title is required')
  }
  if (!data.type) {
    throw new Error('Type is required')
  }

  const slug = generateSlug(data.title)
  const now = new Date().toISOString()

  const guideData = {
    title: data.title.trim(),
    type: data.type,
    slug,
    status: 'draft',
    publishedAt: null,
    updatedAt: now,
    author: data.author || null,
    entries: data.entries || [],
  }

  // Write guide JSON to S3
  await putGuideJSON(slug, guideData)

  // Update the index
  const index = await getGuideIndex()
  const indexEntry = {
    slug,
    title: guideData.title,
    type: guideData.type,
    status: guideData.status,
    publishedAt: guideData.publishedAt,
    updatedAt: guideData.updatedAt,
    entryCount: guideData.entries.length,
  }
  index.guides.push(indexEntry)
  index.updatedAt = now
  await putGuideIndex(index)

  return guideData
}

/**
 * Update an existing guide.
 * @param {string} slug
 * @param {Object} updates - Allowed fields: title, type, status, entries, author
 * @returns {Promise<Object>} The updated guide
 */
export async function updateGuide(slug, updates) {
  const existing = await getGuideJSON(slug)
  const now = new Date().toISOString()

  // Only merge allowed fields
  const allowedFields = ['title', 'type', 'status', 'entries', 'author']
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      existing[field] = updates[field]
    }
  }

  existing.updatedAt = now

  // If status changed to published and no publishedAt yet, set it
  if (existing.status === 'published' && !existing.publishedAt) {
    existing.publishedAt = now
  }

  // Write updated guide to S3
  await putGuideJSON(slug, existing)

  // Update the index entry
  const index = await getGuideIndex()
  const idx = index.guides.findIndex((g) => g.slug === slug)
  const indexEntry = {
    slug,
    title: existing.title,
    type: existing.type,
    status: existing.status,
    publishedAt: existing.publishedAt,
    updatedAt: existing.updatedAt,
    entryCount: (existing.entries || []).length,
  }

  if (idx >= 0) {
    index.guides[idx] = indexEntry
  } else {
    index.guides.push(indexEntry)
  }
  index.updatedAt = now
  await putGuideIndex(index)

  return existing
}

/**
 * Delete a guide by slug.
 * @param {string} slug
 * @returns {Promise<{deleted: boolean}>}
 */
export async function deleteGuide(slug) {
  await deleteGuideJSON(slug)

  // Remove from index
  const index = await getGuideIndex()
  index.guides = index.guides.filter((g) => g.slug !== slug)
  index.updatedAt = new Date().toISOString()
  await putGuideIndex(index)

  return { deleted: true }
}
