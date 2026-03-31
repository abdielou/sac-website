'use client'

import PermissionGate from '@/components/admin/PermissionGate'
import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'
import Link from 'next/link'

const TYPE_LABELS = {
  galaxies: 'Galaxias',
  objects: 'Objetos',
}

/**
 * GuidesContent - Main guide list with status filters and search
 */
function GuidesContent() {
  const router = useRouter()
  const { data: session } = useSession()

  const accessibleActions = session?.user?.accessibleActions || []
  const canCreateGuide = accessibleActions.includes('write_guides')

  const [guides, setGuides] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const debounceRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchGuides = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/admin/guides?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al cargar las guias')
      }

      const data = await res.json()
      setGuides(data.guides || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchGuides()
  }, [fetchGuides])

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.toLowerCase())
    }, 200)
  }

  // Client-side title filter
  const filteredGuides = searchTerm
    ? guides.filter((g) => g.title.toLowerCase().includes(searchTerm))
    : guides

  if (error && !isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Guias</h1>
        </div>
        <ErrorState message={error} onRetry={fetchGuides} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Guias de Observacion</h1>
        {canCreateGuide && (
          <Link
            href="/admin/guides/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nueva guia
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Status toggle pills */}
        <div className="flex items-center gap-2">
          {[
            { value: 'all', label: 'Todos' },
            { value: 'published', label: 'Publicados' },
            { value: 'draft', label: 'Borradores' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`inline-flex px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === s.value
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Buscar por titulo..."
            className="w-full px-3 py-2 pr-8 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('')
                setSearchTerm('')
                if (debounceRef.current) clearTimeout(debounceRef.current)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Limpiar busqueda"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonTable rows={5} columns={5} />
      ) : filteredGuides.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <svg
            className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay guias creadas. Crea la primera guia de observacion.
          </p>
          {canCreateGuide && (
            <Link
              href="/admin/guides/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Crear primera guia
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGuides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/admin/guides/${guide.slug}/edit`}
              className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center p-4 gap-4">
                {/* Title + updated date */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {guide.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Actualizado: {formatDate(guide.updatedAt)}
                  </p>
                </div>

                {/* Type badge */}
                <span className="flex-shrink-0 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                  {TYPE_LABELS[guide.type] || guide.type}
                </span>

                {/* Entry count */}
                <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {guide.entryCount || 0} obj.
                </span>

                {/* Status badge */}
                {guide.status === 'published' ? (
                  <span className="flex-shrink-0 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    Publicado
                  </span>
                ) : (
                  <span className="flex-shrink-0 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                    Borrador
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * GuidesPage - Main export with Suspense boundary
 */
export default function GuidesPage() {
  return (
    <PermissionGate permission="read_guides">
      <Suspense fallback={<SkeletonTable rows={5} columns={5} />}>
        <GuidesContent />
      </Suspense>
    </PermissionGate>
  )
}
