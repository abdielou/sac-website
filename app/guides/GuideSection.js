'use client'

import { useState, useEffect, useCallback } from 'react'
import ObjectCard from './ObjectCard'

const FILTER_DIMENSIONS = {
  equipment: {
    label: 'Equipo',
    options: [
      { value: 'telefono_inteligente', label: 'Tel. inteligente' },
      { value: 'equipo_pequeno', label: 'Equipo pequeno' },
      { value: 'telescopio_grande', label: 'Telescopio grande' },
    ],
  },
  difficulty: {
    label: 'Dificultad',
    options: [
      { value: 'facil', label: 'Facil' },
      { value: 'intermedio', label: 'Intermedio' },
      { value: 'retante', label: 'Retante' },
    ],
  },
  location: {
    label: 'Ubicacion',
    options: [
      { value: 'ciudad', label: 'Ciudad' },
      { value: 'suburbios', label: 'Suburbios' },
      { value: 'oscuro', label: 'Oscuro' },
    ],
  },
}

const SORT_OPTIONS = [
  { value: 'nombre', label: 'Nombre' },
  { value: 'hora', label: 'Hora optima' },
  { value: 'dificultad', label: 'Dificultad' },
  { value: 'magnitud', label: 'Magnitud' },
]

const DIFFICULTY_ORDER = { facil: 0, intermedio: 1, retante: 2 }

function getDisplayName(entry) {
  const c = entry.catalog
  if (!c) return entry.objectId
  return c.commonNameEs || c.commonName || c.name || entry.objectId
}

function sortEntries(entries, sortField) {
  const sorted = [...entries]
  switch (sortField) {
    case 'nombre':
      return sorted.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), 'es'))
    case 'hora':
      return sorted.sort((a, b) =>
        (a.optimalTime || '99:99').localeCompare(b.optimalTime || '99:99')
      )
    case 'dificultad':
      return sorted.sort(
        (a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99)
      )
    case 'magnitud':
      return sorted.sort((a, b) => (a.catalog?.magnitude ?? 99) - (b.catalog?.magnitude ?? 99))
    default:
      return sorted
  }
}

function filterEntries(entries, filters) {
  return entries.filter((entry) => {
    for (const [dim, activeValues] of Object.entries(filters)) {
      if (activeValues.length === 0) continue
      if (!activeValues.includes(entry[dim])) return false
    }
    return true
  })
}

export default function GuideSection({ type, editions, sectionTitle }) {
  const [selectedSlug, setSelectedSlug] = useState(editions[0]?.slug || '')
  const [guideData, setGuideData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ equipment: [], difficulty: [], location: [] })
  const [sortField, setSortField] = useState('nombre')

  const fetchGuide = useCallback(async (slug) => {
    if (!slug) return
    setLoading(true)
    try {
      const res = await fetch(`/api/guides/public?slug=${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json()
        setGuideData(data.guide)
      } else {
        setGuideData(null)
      }
    } catch {
      setGuideData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedSlug) fetchGuide(selectedSlug)
  }, [selectedSlug, fetchGuide])

  // No editions at all
  if (!editions || editions.length === 0) {
    return (
      <section className="py-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sectionTitle}</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          No hay guias publicadas de este tipo.
        </p>
      </section>
    )
  }

  const toggleFilter = (dimension, value) => {
    setFilters((prev) => {
      const current = prev[dimension]
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [dimension]: next }
    })
  }

  const clearFilters = () => {
    setFilters({ equipment: [], difficulty: [], location: [] })
  }

  const hasActiveFilters = Object.values(filters).some((arr) => arr.length > 0)
  const entries = guideData?.entries || []
  const filtered = filterEntries(entries, filters)
  const sorted = sortEntries(filtered, sortField)

  return (
    <section className="py-6">
      {/* Header with title, dropdown, and PDF button */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sectionTitle}</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            {editions.map((ed) => (
              <option key={ed.slug} value={ed.slug}>
                {ed.title} ({new Date(ed.publishedAt).toLocaleDateString('es-PR')})
              </option>
            ))}
          </select>
          <button
            disabled
            title="Disponible proximamente"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="mb-4 space-y-2">
        {Object.entries(FILTER_DIMENSIONS).map(([dim, config]) => (
          <div key={dim} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20">
              {config.label}:
            </span>
            {config.options.map((opt) => {
              const active = filters[dim].includes(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleFilter(dim, opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Sort control */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ordenar por:</span>
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs px-2 py-1 text-gray-900 dark:text-gray-100"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Object grid */}
      {!loading && sorted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((entry) => (
            <ObjectCard key={entry.objectId} entry={entry} />
          ))}
        </div>
      )}

      {/* Empty filter state */}
      {!loading && entries.length > 0 && sorted.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">
            Ningun objeto coincide con los filtros seleccionados.
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* No entries in this guide */}
      {!loading && entries.length === 0 && guideData && (
        <p className="text-gray-500 dark:text-gray-400 py-4">Esta guia no tiene objetos aun.</p>
      )}
    </section>
  )
}
