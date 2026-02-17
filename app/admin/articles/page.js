'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { SkeletonTable } from '@/components/admin/SkeletonTable'
import { ErrorState } from '@/components/admin/ErrorState'
import { formatDate } from '@/lib/formatters'
import Link from 'next/link'

/**
 * ArticlesContent - Main content component for article list
 * Handles URL params, filtering, pagination, and data display
 */
function ArticlesContent() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read filters from URL params
  const statusParam = searchParams.get('status') || 'all'
  const searchParam = searchParams.get('search') || ''
  const tagParam = searchParams.get('tag') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10)

  // Local state
  const [searchInput, setSearchInput] = useState(searchParam)
  const [articles, setArticles] = useState([])
  const [allTags, setAllTags] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)

  // Sync search input when URL param changes externally
  useEffect(() => {
    setSearchInput(searchParam)
  }, [searchParam])

  // Fetch articles from API
  const fetchArticles = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (statusParam && statusParam !== 'all') params.set('status', statusParam)
      if (searchParam) params.set('search', searchParam)
      if (tagParam) params.set('tag', tagParam)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/admin/articles?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al cargar los articulos')
      }

      const data = await res.json()
      setArticles(data.articles || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)

      // Extract unique tags from articles for the filter dropdown
      // Only on initial load (no tag filter), otherwise we already have the tag list
      if (!tagParam) {
        const tags = new Set()
        ;(data.articles || []).forEach((a) => {
          if (Array.isArray(a.tags)) {
            a.tags.forEach((t) => tags.add(t))
          }
        })
        setAllTags(Array.from(tags).sort())
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [statusParam, searchParam, tagParam, page, pageSize])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  // Also fetch all tags on mount (separate request without filters to get complete tag list)
  useEffect(() => {
    async function fetchAllTags() {
      try {
        const res = await fetch('/api/admin/articles?pageSize=10000')
        if (res.ok) {
          const data = await res.json()
          const tags = new Set()
          ;(data.articles || []).forEach((a) => {
            if (Array.isArray(a.tags)) {
              a.tags.forEach((t) => tags.add(t))
            }
          })
          setAllTags(Array.from(tags).sort())
        }
      } catch {
        // Silently fail - tag filter just won't have options
      }
    }
    fetchAllTags()
  }, [])

  /**
   * Update URL params when filter changes
   * Always resets to page 1 except when changing page itself
   */
  const updateFilter = (key, value) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    // Reset to page 1 when filter changes (except when changing page)
    if (key !== 'page') {
      params.set('page', '1')
    }

    router.replace(`${pathname}?${params.toString()}`)
  }

  /**
   * Handle search input with debounce
   */
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchInput(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      updateFilter('search', value)
    }, 300)
  }

  // Error state
  if (error && !isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Articulos</h1>
        </div>
        <ErrorState message={error} onRetry={fetchArticles} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Articulos</h1>
        <Link
          href="/admin/articles/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Articulo
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Status toggle pills */}
        <div className="flex items-center gap-2">
          {[
            { value: 'all', label: 'Todos' },
            { value: 'published', label: 'Publicado' },
            { value: 'draft', label: 'Borrador' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => updateFilter('status', s.value === 'all' ? '' : s.value)}
              className={`inline-flex px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusParam === s.value || (s.value === 'all' && !statusParam)
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search input */}
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
                if (debounceRef.current) clearTimeout(debounceRef.current)
                updateFilter('search', '')
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

        {/* Tag filter dropdown */}
        <select
          value={tagParam}
          onChange={(e) => updateFilter('tag', e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Todas las etiquetas</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <SkeletonTable rows={8} columns={5} />
      ) : articles.length === 0 ? (
        /* Empty state */
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
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 mb-4">No se encontraron articulos</p>
          <Link
            href="/admin/articles/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Crear primer articulo
          </Link>
        </div>
      ) : (
        <>
          {/* Article list - card rows */}
          <div className="space-y-2">
            {articles.map((article) => (
              <Link
                key={article.slug}
                href={`/admin/articles/edit/${article.slug}`}
                className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center p-4 gap-4">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {article.images && article.images.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={article.images[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-gray-300 dark:text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Middle content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {article.title}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatDate(article.date)}
                      {article.authors && article.authors.length > 0 && (
                        <span> &middot; {article.authors.join(', ')}</span>
                      )}
                    </p>
                    {article.summary && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                        {article.summary}
                      </p>
                    )}
                  </div>

                  {/* Right side: status badge + tags */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    {article.draft ? (
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                        Borrador
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        Publicado
                      </span>
                    )}
                    {article.tags && article.tags.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1 max-w-[200px]">
                        {article.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                        {article.tags.length > 3 && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            +{article.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Mostrando {articles.length} de {total} articulos
            </span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => updateFilter('page', String(page - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Pagina {page} de {totalPages}
                </span>
                <button
                  onClick={() => updateFilter('page', String(page + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * ArticlesPage - Main export with Suspense boundary
 */
export default function ArticlesPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={8} columns={5} />}>
      <ArticlesContent />
    </Suspense>
  )
}
