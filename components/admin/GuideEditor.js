'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import CatalogSearch from './CatalogSearch'
import GuideObjectRow from './GuideObjectRow'

/**
 * GuideEditor - Full guide editor with catalog search, object list, annotations, and save/publish.
 *
 * @param {Object|null} initialGuide - null for create, guide object for edit
 */
export default function GuideEditor({ initialGuide = null }) {
  const router = useRouter()
  const isEdit = !!initialGuide

  const [title, setTitle] = useState(initialGuide?.title || '')
  const [type, setType] = useState(initialGuide?.type || 'galaxies')
  const [entries, setEntries] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [isResolvingCatalog, setIsResolvingCatalog] = useState(false)

  /**
   * On mount in edit mode, resolve catalog display data for each entry.
   * Fetches catalog search to get display names, catalog IDs, etc.
   */
  useEffect(() => {
    if (!initialGuide?.entries?.length) return

    let cancelled = false
    const resolveEntries = async () => {
      setIsResolvingCatalog(true)
      const resolved = new Map()
      const toResolve = initialGuide.entries.filter((e) => e.objectId)

      // Batch resolve: fetch each unique objectId
      const uniqueIds = [...new Set(toResolve.map((e) => e.objectId))]
      await Promise.all(
        uniqueIds.map(async (objectId) => {
          try {
            const res = await fetch(
              `/api/admin/catalog/search?q=${encodeURIComponent(objectId)}&limit=5`
            )
            if (res.ok) {
              const data = await res.json()
              const arr = Array.isArray(data) ? data : data.results || []
              // Find exact match by id
              const match = arr.find((o) => o.id === objectId) || arr[0]
              if (match) resolved.set(objectId, match)
            }
          } catch {
            // Skip unresolvable objects — they'll show raw objectId
          }
        })
      )

      if (cancelled) return

      const hydrated = initialGuide.entries.map((entry) => ({
        ...entry,
        _catalogData: resolved.get(entry.objectId) || null,
      }))
      setEntries(hydrated)
      setIsResolvingCatalog(false)
    }

    resolveEntries()
    return () => {
      cancelled = true
    }
  }, [initialGuide])

  /**
   * Set of objectIds currently in the guide, for duplicate detection in CatalogSearch.
   */
  const addedObjectIds = useMemo(() => {
    return new Set(entries.map((e) => e.objectId))
  }, [entries])

  /**
   * Add an object from catalog search to the entries list.
   */
  const handleAddObject = useCallback((catalogObj) => {
    setEntries((prev) => {
      // Check duplicate
      if (prev.some((e) => e.objectId === catalogObj.id)) return prev
      return [
        ...prev,
        {
          objectId: catalogObj.id,
          difficulty: '',
          equipment: '',
          location: '',
          optimalTime: '',
          notes: '',
          _catalogData: catalogObj,
        },
      ]
    })
  }, [])

  /**
   * Update an entry's annotations.
   */
  const handleUpdateEntry = useCallback((index, updatedEntry) => {
    setEntries((prev) => {
      const next = [...prev]
      next[index] = updatedEntry
      return next
    })
  }, [])

  /**
   * Remove an entry by index.
   */
  const handleRemoveEntry = useCallback((index) => {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /**
   * Swap entry at index with the one above.
   */
  const handleMoveUp = useCallback((index) => {
    if (index === 0) return
    setEntries((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }, [])

  /**
   * Swap entry at index with the one below.
   */
  const handleMoveDown = useCallback((index) => {
    setEntries((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }, [])

  /**
   * Strip _catalogData before sending entries to the API.
   */
  const cleanEntries = () => {
    return entries.map(({ _catalogData, ...rest }) => rest)
  }

  /**
   * Save the guide (create or update).
   * @param {string} status - 'draft' or 'published'
   */
  const handleSave = async (status) => {
    if (!title.trim()) {
      setError('El titulo es obligatorio.')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const body = {
        title: title.trim(),
        type,
        status,
        entries: cleanEntries(),
      }

      let res
      if (isEdit) {
        res = await fetch(`/api/admin/guides/${initialGuide.slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch('/api/admin/guides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al guardar la guia')
      }

      router.push('/admin/guides')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Delete the guide (edit mode only).
   */
  const handleDelete = async () => {
    if (
      !confirm('Estas seguro de que deseas eliminar esta guia? Esta accion no se puede deshacer.')
    )
      return

    setIsSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/guides/${initialGuide.slug}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al eliminar la guia')
      }

      router.push('/admin/guides')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Title and type */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Titulo de la guia
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Galaxias de Marzo 2026"
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tipo
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="galaxies">Galaxias</option>
            <option value="objects">Objetos</option>
          </select>
        </div>
      </div>

      {/* Split layout: catalog search + entries */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
        {/* Left: catalog search */}
        <div className="order-2 lg:order-1">
          <CatalogSearch onAddObject={handleAddObject} addedObjectIds={addedObjectIds} />
        </div>

        {/* Right: entries */}
        <div className="order-1 lg:order-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Objetos en la guia ({entries.length})
            </h3>
          </div>

          {isResolvingCatalog ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando objetos...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <svg
                className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Busca objetos en el catalogo y agregalos a la guia.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, i) => (
                <GuideObjectRow
                  key={entry.objectId}
                  entry={entry}
                  index={i}
                  total={entries.length}
                  onUpdate={handleUpdateEntry}
                  onRemove={handleRemoveEntry}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => handleSave('draft')}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Guardando...' : 'Guardar borrador'}
        </button>

        {isEdit && initialGuide.status === 'published' ? (
          <button
            type="button"
            onClick={() => handleSave('draft')}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Despublicar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSave('published')}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Publicar
          </button>
        )}

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Eliminar
          </button>
        )}

        <button
          type="button"
          onClick={() => router.push('/admin/guides')}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
