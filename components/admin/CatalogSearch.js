'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import hubbleImages from '@/data/catalog/hubble-images.json'

function SearchResultThumb({ objectId, catalog, name }) {
  const [showPreview, setShowPreview] = useState(false)
  const hubbleId = hubbleImages[objectId]
  const thumbUrl = getObjectImageUrl(objectId, catalog)
  const previewUrl = hubbleId
    ? `https://cdn.esahubble.org/archives/images/thumb700x/${hubbleId}.jpg`
    : thumbUrl

  if (!thumbUrl) return null

  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <img
        src={thumbUrl}
        alt={name}
        loading="lazy"
        className="w-10 h-10 rounded object-cover bg-gray-100 dark:bg-gray-900 cursor-pointer"
      />
      {showPreview && (
        <div
          className="fixed z-[9999] p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl pointer-events-none"
          ref={(el) => {
            if (el) {
              const rect = el.previousElementSibling.getBoundingClientRect()
              el.style.top = `${rect.top - 20}px`
              el.style.left = `${rect.right + 8}px`
            }
          }}
        >
          <img src={previewUrl} alt={name} className="w-48 h-48 rounded object-cover" />
        </div>
      )}
    </div>
  )
}

function getObjectImageUrl(objectId, catalog) {
  const hubbleId = hubbleImages[objectId]
  if (hubbleId) return `https://cdn.esahubble.org/archives/images/thumb300y/${hubbleId}.jpg`
  if (catalog?.ra != null && catalog?.dec != null) {
    return `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Position=${catalog.ra},${catalog.dec}&Survey=DSS&Return=JPEG&Pixels=80`
  }
  return null
}

/**
 * CatalogSearch - Search panel for the object catalog
 * Used within GuideEditor to find and add objects to a guide.
 *
 * @param {Function} onAddObject - callback receiving a catalog object when user clicks "Agregar"
 * @param {Set} addedObjectIds - set of objectIds already in the guide (to disable duplicate adds)
 */
export default function CatalogSearch({ onAddObject, addedObjectIds = new Set() }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef(null)

  const objectTypes = [
    'Galaxy',
    'Open Cluster',
    'Globular Cluster',
    'Planetary Nebula',
    'Bright Nebula',
    'Star',
    'Double Star',
    'Galaxy Pair',
    'Galaxy Triplet',
  ]

  const doSearch = useCallback(async (q, type) => {
    setIsLoading(true)
    setHasSearched(true)

    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (type) params.set('type', type)
      params.set('limit', '25')

      const res = await fetch(`/api/admin/catalog/search?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setResults(Array.isArray(data) ? data : data.results || [])
      } else {
        setResults([])
      }
    } catch {
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load initial results on mount
  useEffect(() => {
    doSearch('', '')
  }, [doSearch])

  const handleQueryChange = (e) => {
    const value = e.target.value
    setQuery(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(value, typeFilter)
    }, 300)
  }

  const handleTypeChange = (e) => {
    const value = e.target.value
    setTypeFilter(value)
    doSearch(query, value)
  }

  /**
   * Build a human-readable display name for a catalog object.
   */
  const displayName = (obj) => {
    return obj.commonNameEs || obj.commonName || obj.name || obj.id
  }

  /**
   * Build catalog ID string like "M 31 / NGC 224"
   */
  const catalogIds = (obj) => {
    const ids = []
    if (obj.catalogIds) {
      if (obj.catalogIds.messier) ids.push(`M ${obj.catalogIds.messier}`)
      if (obj.catalogIds.ngc) ids.push(`NGC ${obj.catalogIds.ngc}`)
      if (obj.catalogIds.ic) ids.push(`IC ${obj.catalogIds.ic}`)
    }
    return ids.join(' / ') || obj.id
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Buscar en el catalogo
      </h3>

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={handleQueryChange}
        placeholder="Buscar por nombre o ID (ej: M31, Andromeda)..."
        className="w-full px-3 py-2 mb-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={handleTypeChange}
        className="w-full px-3 py-2 mb-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">Todos los tipos</option>
        {objectTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {/* Results */}
      <div className="max-h-[400px] overflow-y-auto space-y-1">
        {isLoading && (
          <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">Buscando...</p>
        )}

        {!isLoading && hasSearched && results.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
            Sin resultados
          </p>
        )}

        {!isLoading &&
          results.map((obj) => {
            const alreadyAdded = addedObjectIds.has(obj.id)
            return (
              <div
                key={obj.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <SearchResultThumb objectId={obj.id} catalog={obj} name={displayName(obj)} />
                <div className="min-w-0 flex-1 ml-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {displayName(obj)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {catalogIds(obj)}
                    {obj.objectType && (
                      <span className="ml-2 text-gray-400 dark:text-gray-500">
                        {obj.objectType}
                      </span>
                    )}
                    {obj.magnitude != null && <span className="ml-2">mag {obj.magnitude}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !alreadyAdded && onAddObject(obj)}
                  disabled={alreadyAdded}
                  className={`ml-2 flex-shrink-0 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    alreadyAdded
                      ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {alreadyAdded ? 'Agregado' : 'Agregar'}
                </button>
              </div>
            )
          })}
      </div>
    </div>
  )
}
