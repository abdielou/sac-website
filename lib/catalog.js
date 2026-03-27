import curatedData from '../data/catalog/openngc-curated.json'
import supplementaryData from '../data/catalog/supplementary.json'

// Singleton cached catalog (merged on first access)
let _catalog = null

/**
 * Load and cache the merged catalog. Uses static imports so webpack
 * bundles the JSON data directly — no filesystem access needed at runtime.
 */
function loadCatalog() {
  if (!_catalog) {
    _catalog = [...curatedData, ...supplementaryData]
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
 * Strip diacritics for accent-insensitive search.
 * "Pléyades" -> "pleyades", "Nebulosa" -> "nebulosa"
 */
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
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

  const q = stripAccents(query.trim())
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
    else if (obj.name && stripAccents(obj.name) === q) {
      score = 90
    }
    // Exact common name match
    else if (obj.commonName && stripAccents(obj.commonName) === q) {
      score = 85
    } else if (obj.commonNameEs && stripAccents(obj.commonNameEs) === q) {
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
    else if (obj.name && stripAccents(obj.name).includes(q)) {
      score = 50
    }
    // Common name contains query
    else if (obj.commonName && stripAccents(obj.commonName).includes(q)) {
      score = 40
    } else if (obj.commonNameEs && stripAccents(obj.commonNameEs).includes(q)) {
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
 * Browse the catalog without a search query. Returns objects sorted by magnitude
 * (brightest first), optionally filtered by type.
 *
 * @param {Object} [options]
 * @param {string} [options.type] - Filter by objectType
 * @param {number} [options.limit=25] - Maximum results
 * @returns {Array} Catalog objects
 */
export function browseCatalog(options = {}) {
  const { type, limit = 25 } = options
  const catalog = loadCatalog()

  let filtered = catalog
  if (type) filtered = catalog.filter((o) => o.objectType === type)

  // Sort by magnitude (brightest first), objects without magnitude last
  const sorted = [...filtered].sort((a, b) => (a.magnitude ?? 999) - (b.magnitude ?? 999))
  return sorted.slice(0, limit)
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
