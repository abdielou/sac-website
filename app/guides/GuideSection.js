'use client'

import { useState } from 'react'
import Link from '@/components/Link'
import ObjectCard from './ObjectCard'

const FILTER_DIMENSIONS = {
  equipment: {
    label: 'Equipo',
    options: [
      { value: 'telescopio_inteligente', label: 'Telescopio inteligente' },
      { value: 'equipo_pequeno', label: 'Equipo pequeño' },
      { value: 'telescopio_grande', label: 'Telescopio grande' },
      { value: 'dslr', label: 'Cámara DSLR' },
    ],
  },
  difficulty: {
    label: 'Dificultad',
    options: [
      { value: 'facil', label: 'Fácil' },
      { value: 'intermedio', label: 'Intermedio' },
      { value: 'retante', label: 'Retante' },
    ],
  },
  location: {
    label: 'Ubicación',
    options: [
      { value: 'ciudad', label: 'Ciudad' },
      { value: 'suburbios', label: 'Suburbios' },
      { value: 'oscuro', label: 'Cielo oscuro' },
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

/**
 * Parse time string like "8:00 PM", "12:30 AM" into minutes since midnight for sorting.
 * Evening times (PM) sort before early morning (AM) by treating AM as next day.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 9999
  // Handle 12h format: "8:00 PM", "12:30 AM"
  const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (match12) {
    let hours = parseInt(match12[1], 10)
    const minutes = parseInt(match12[2], 10)
    const period = match12[3].toUpperCase()
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    if (hours < 7) hours += 24
    return hours * 60 + minutes
  }
  // Handle 24h format: "20:00", "01:30"
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (match24) {
    let hours = parseInt(match24[1], 10)
    const minutes = parseInt(match24[2], 10)
    if (hours < 7) hours += 24
    return hours * 60 + minutes
  }
  return 9999
}

function sortEntries(entries, sortField) {
  const sorted = [...entries]
  switch (sortField) {
    case 'nombre':
      return sorted.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), 'es'))
    case 'hora':
      return sorted.sort(
        (a, b) => parseTimeToMinutes(a.optimalTime) - parseTimeToMinutes(b.optimalTime)
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

/**
 * One guide section: the edition switcher, the filter and sort controls, and the
 * object grid.
 *
 * `entries` arrives already resolved from the server, so the whole object table
 * is present in the initial HTML. Only filtering and sorting run on the client.
 * The edition switcher is a list of real links to /guides/<slug>, so every
 * edition is reachable and crawlable on its own URL.
 */
export default function GuideSection({
  editions = [],
  activeSlug = '',
  entries = [],
  sectionTitle,
  sectionHref,
}) {
  const [filters, setFilters] = useState({ equipment: [], difficulty: [], location: [] })
  const [sortField, setSortField] = useState('hora')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Nothing at all to show. The edition list alone must NOT gate this: an
  // edition page resolves its own `entries`, and listPublishedEditions() returns
  // [] on any S3 index failure, which would otherwise discard an already-loaded
  // object grid and leave the page contradicting its own ItemList JSON-LD.
  if (editions.length === 0 && entries.length === 0) {
    return (
      <section className="py-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sectionTitle}</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          No hay guías publicadas de este tipo.
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
  const filtered = filterEntries(entries, filters)
  const sorted = sortEntries(filtered, sortField)
  const activeCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0)
  const current = editions.find((ed) => ed.slug === activeSlug) || editions[0]

  return (
    <section className="py-6">
      {/* Section heading */}
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {sectionHref ? (
          <Link href={sectionHref} className="hover:text-blue-600 dark:hover:text-blue-400">
            {sectionTitle}
          </Link>
        ) : (
          sectionTitle
        )}
      </h2>

      {/* Edition switcher: one crawlable link per edition */}
      <nav aria-label={`Ediciones de ${sectionTitle}`} className="mt-3 mb-4">
        <ul className="flex flex-wrap items-center gap-2">
          {editions.map((ed) => {
            const active = ed.slug === current?.slug
            return (
              <li key={ed.slug}>
                <Link
                  href={ed.path}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-block px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {ed.rawTitle || ed.title}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapsible filters & sort */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Filtros y orden
          {!filtersOpen && activeCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
              {activeCount}
            </span>
          )}
        </button>

        {filtersOpen && (
          <div className="mt-3 space-y-2 pl-6">
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

            {/* Sort control */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20">
                Ordenar:
              </span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                aria-label="Ordenar objetos"
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs px-2 py-1 text-gray-900 dark:text-gray-100"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Object grid — server-rendered on first paint */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((entry) => (
            <ObjectCard key={entry.objectId} entry={entry} />
          ))}
        </div>
      )}

      {/* Empty filter state */}
      {entries.length > 0 && sorted.length === 0 && (
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

      {/* No entries in this edition */}
      {entries.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400 py-4">Esta guia no tiene objetos aun.</p>
      )}
    </section>
  )
}
