import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Singleton cached catalog
let _catalog = null

/**
 * Load and cache the full catalog. Returns the array of objects.
 * Uses fs.readFileSync for Node.js compatibility (Next.js webpack handles JSON imports,
 * but direct Node execution on v24+ requires import attributes for JSON).
 */
function loadCatalog() {
  if (!_catalog) {
    const catalogPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'data',
      'catalog',
      'openngc.json'
    )
    _catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
  }
  return _catalog
}

/**
 * Normalize a catalog ID query for matching: lowercase, strip spaces.
 * "M 31" -> "m31", "NGC 224" -> "ngc224"
 */
function normalizeCatalogId(str) {
  return str.toLowerCase().replace(/\s+/g, '')
}

/**
 * Search the catalog by text query.
 *
 * @param {string} query - Search text (name, catalog ID, common name)
 * @param {Object} [options]
 * @param {string} [options.type] - Filter by objectType (e.g., "Galaxy", "Open Cluster")
 * @param {number} [options.limit=50] - Maximum results
 * @returns {Array} Matching catalog objects, sorted by relevance
 */
export function searchCatalog(query, options = {}) {
  const { type, limit = 50 } = options
  const catalog = loadCatalog()

  if (!query || typeof query !== 'string') return []

  const q = query.trim().toLowerCase()
  const qNorm = normalizeCatalogId(query)

  // Score each object
  const scored = []

  for (const obj of catalog) {
    // Apply type filter first
    if (type && obj.objectType !== type) continue

    let score = 0

    // Exact catalog ID match (highest priority)
    const ids = obj.catalogIds || {}
    if (
      (ids.ngc && normalizeCatalogId(ids.ngc) === qNorm) ||
      (ids.ic && normalizeCatalogId(ids.ic) === qNorm) ||
      (ids.messier && normalizeCatalogId(ids.messier) === qNorm)
    ) {
      score = 100
    }
    // Exact name match
    else if (obj.name && obj.name.toLowerCase() === q) {
      score = 90
    }
    // Exact common name match
    else if (obj.commonName && obj.commonName.toLowerCase() === q) {
      score = 85
    } else if (obj.commonNameEs && obj.commonNameEs.toLowerCase() === q) {
      score = 85
    }
    // Partial catalog ID match (starts with)
    else if (
      (ids.ngc && normalizeCatalogId(ids.ngc).startsWith(qNorm)) ||
      (ids.ic && normalizeCatalogId(ids.ic).startsWith(qNorm)) ||
      (ids.messier && normalizeCatalogId(ids.messier).startsWith(qNorm))
    ) {
      score = 70
    }
    // Partial name match (contains)
    else if (obj.name && obj.name.toLowerCase().includes(q)) {
      score = 50
    }
    // Common name contains query
    else if (obj.commonName && obj.commonName.toLowerCase().includes(q)) {
      score = 40
    } else if (obj.commonNameEs && obj.commonNameEs.toLowerCase().includes(q)) {
      score = 40
    }

    if (score > 0) {
      scored.push({ obj, score })
    }
  }

  // Sort by score descending, then by name
  scored.sort((a, b) => b.score - a.score || a.obj.name.localeCompare(b.obj.name))

  return scored.slice(0, limit).map((s) => s.obj)
}

/**
 * Look up a single object by its primary catalog ID (e.g., "NGC0224").
 *
 * @param {string} id - Primary catalog ID
 * @returns {Object|null} The catalog object or null
 */
export function getObjectById(id) {
  if (!id) return null
  const catalog = loadCatalog()
  return catalog.find((o) => o.id === id) || null
}

/**
 * Get aggregate statistics about the catalog.
 *
 * @returns {{ totalObjects: number, byType: Object, withSpanishNames: number }}
 */
export function getCatalogStats() {
  const catalog = loadCatalog()

  const byType = {}
  let withSpanishNames = 0

  for (const obj of catalog) {
    byType[obj.objectType] = (byType[obj.objectType] || 0) + 1
    if (obj.commonNameEs) withSpanishNames++
  }

  return {
    totalObjects: catalog.length,
    byType,
    withSpanishNames,
  }
}
