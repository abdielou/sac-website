'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

import siteMetadata from '@/data/siteMetadata'
import { mergeTags } from '@/lib/utils/tagInput'

/**
 * The root layout renders titles through the template `%s | SAC`, so the suffix
 * is part of every rendered title even though the editor never types it.
 */
export const TITLE_SUFFIX = ` | ${siteMetadata.headerTitleAbbrev}`

/** Google truncates a title near 60 characters, suffix included. */
export const SERP_TITLE_MAX = 60

/** What the editor may type before the rendered title passes SERP_TITLE_MAX. */
export const TITLE_LIMIT = SERP_TITLE_MAX - TITLE_SUFFIX.length

/** Summary length bands. Between MIN_GOOD and MAX_GOOD is the target. */
export const SUMMARY_MIN_GOOD = 120
export const SUMMARY_MAX_GOOD = 155
export const SUMMARY_MAX = 160

/** Google truncates a description near 155 characters. */
export const SERP_DESCRIPTION_MAX = SUMMARY_MAX_GOOD

/** Shown when an editor tries to publish an article with no tags. */
export const MISSING_TAGS_MESSAGE =
  'Agrega al menos una etiqueta antes de publicar. Un articulo sin etiquetas queda fuera de todas las paginas de temas.'

/**
 * Trim and collapse every run of whitespace to a single space.
 *
 * Three live titles carry a stray `' ;  '` sequence from a bad paste, and it
 * renders literally in the SERP. Collapsing on save stops that recurring.
 *
 * @param {string} value
 * @returns {string}
 */
export function collapseWhitespace(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

/**
 * Classify a title by the length Google can show.
 *
 * @param {string} title - Title as typed, without the site-name suffix
 * @returns {{count: number, rendered: number, limit: number, status: string}}
 *          status is 'empty', 'ok' or 'warning'
 */
export function classifyTitleLength(title) {
  const count = collapseWhitespace(title).length
  const rendered = count === 0 ? 0 : count + TITLE_SUFFIX.length

  let status = 'ok'
  if (count === 0) status = 'empty'
  else if (count > TITLE_LIMIT) status = 'warning'

  return { count, rendered, limit: TITLE_LIMIT, status }
}

/**
 * Classify a summary by the length Google can show as the description.
 *
 * @param {string} summary
 * @returns {{count: number, status: string}} status is 'empty', 'short',
 *          'good', 'ok' or 'warning'
 */
export function classifySummaryLength(summary) {
  const count = collapseWhitespace(summary).length

  let status = 'good'
  if (count === 0) status = 'empty'
  else if (count < SUMMARY_MIN_GOOD) status = 'short'
  else if (count <= SUMMARY_MAX_GOOD) status = 'good'
  else if (count <= SUMMARY_MAX) status = 'ok'
  else status = 'warning'

  return { count, status }
}

/**
 * Cut text the way a SERP does: at the last word boundary, then an ellipsis.
 *
 * @param {string} text
 * @param {number} max - Maximum characters before the ellipsis
 * @returns {string}
 */
export function truncateForSerp(text, max) {
  const clean = collapseWhitespace(text)
  if (clean.length <= max) return clean

  const cut = clean.slice(0, max)
  let body = cut

  // Keep the whole cut when it already ends on a word boundary.
  if (!/\s/.test(clean.charAt(max))) {
    const lastSpace = cut.lastIndexOf(' ')
    if (lastSpace > 0) body = cut.slice(0, lastSpace)
  }

  return `${body.replace(/[\s.,;:-]+$/, '')}…`
}

/**
 * The full title a search engine sees, suffix included.
 *
 * @param {string} title
 * @returns {string}
 */
export function renderedTitle(title) {
  const clean = collapseWhitespace(title)
  return clean ? `${clean}${TITLE_SUFFIX}` : siteMetadata.title
}

/**
 * Block publishing when the article would be orphaned from every tag hub.
 * Drafts are allowed to stay untagged.
 *
 * @param {object} metadata - Editor metadata state
 * @returns {string|null} Spanish error message, or null when publishing is fine
 */
export function validateForPublish(metadata) {
  const tags = Array.isArray(metadata?.tags) ? metadata.tags : []
  return tags.length === 0 ? MISSING_TAGS_MESSAGE : null
}

/** Breadcrumb line of the SERP preview, e.g. `www.sociedadastronomia.com › blog`. */
const SERP_URL_LABEL = `${String(siteMetadata.siteUrl)
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '')} › blog`

const TITLE_TONE = {
  empty: 'text-gray-500 dark:text-gray-400',
  ok: 'text-green-600 dark:text-green-400',
  warning: 'text-red-600 dark:text-red-400',
}

const SUMMARY_TONE = {
  empty: 'text-gray-500 dark:text-gray-400',
  short: 'text-yellow-600 dark:text-yellow-400',
  good: 'text-green-600 dark:text-green-400',
  ok: 'text-yellow-600 dark:text-yellow-400',
  warning: 'text-red-600 dark:text-red-400',
}

const SUMMARY_HINTS = {
  empty: 'Escribe un resumen. Google lo usa como descripcion del resultado.',
  short: `Resumen corto. Lo ideal es entre ${SUMMARY_MIN_GOOD} y ${SUMMARY_MAX_GOOD} caracteres.`,
  good: 'Largo ideal para el resultado de busqueda.',
  ok: `Cerca del limite. Lo ideal es entre ${SUMMARY_MIN_GOOD} y ${SUMMARY_MAX_GOOD} caracteres.`,
  warning: `Resumen largo. Google recorta cerca de ${SERP_DESCRIPTION_MAX} caracteres.`,
}

/**
 * ArticleMetadataForm - Metadata fields above the article editor
 *
 * Includes title, date, author, tags (autocomplete), summary, and featured image.
 * All labels and placeholders in Spanish.
 *
 * @param {object} props
 * @param {object} props.metadata - Current metadata state
 * @param {function} props.onUpdate - Callback (field, value) to update a metadata field
 * @param {Array} props.authors - List of { slug, name } author objects
 * @param {Array} props.allTags - List of existing tag strings for autocomplete
 */
export default function ArticleMetadataForm({ metadata, onUpdate, authors = [], allTags = [] }) {
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const tagInputRef = useRef(null)
  const suggestionsRef = useRef(null)

  // Close suggestions on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Show suggestions that match the text still being typed
  const refreshSuggestions = useCallback(
    (value, selectedTags) => {
      if (value.trim()) {
        const lower = value.toLowerCase()
        const filtered = allTags.filter(
          (t) => t.toLowerCase().includes(lower) && !selectedTags.includes(t)
        )
        setTagSuggestions(filtered)
        setShowSuggestions(true)
      } else {
        setTagSuggestions([])
        setShowSuggestions(false)
      }
    },
    [allTags]
  )

  // Commit each completed tag as the user types a comma, keep the rest pending
  const handleTagInputChange = useCallback(
    (e) => {
      const value = e.target.value
      const lastSeparator = value.lastIndexOf(',')

      if (lastSeparator === -1) {
        setTagInput(value)
        refreshSuggestions(value, metadata.tags)
        return
      }

      const merged = mergeTags(metadata.tags, value.slice(0, lastSeparator))
      const pending = value.slice(lastSeparator + 1)
      if (merged !== metadata.tags) {
        onUpdate('tags', merged)
      }
      setTagInput(pending)
      refreshSuggestions(pending, merged)
    },
    [metadata.tags, onUpdate, refreshSuggestions]
  )

  // Add one or more tags from a raw input string
  const addTag = useCallback(
    (tag) => {
      const merged = mergeTags(metadata.tags, tag)
      if (merged !== metadata.tags) {
        onUpdate('tags', merged)
      }
      setTagInput('')
      setTagSuggestions([])
      setShowSuggestions(false)
    },
    [metadata.tags, onUpdate]
  )

  // Remove a tag
  const removeTag = useCallback(
    (tagToRemove) => {
      onUpdate(
        'tags',
        metadata.tags.filter((t) => t !== tagToRemove)
      )
    },
    [metadata.tags, onUpdate]
  )

  // Handle Enter key in tag input
  const handleTagKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (tagInput.trim()) {
          addTag(tagInput)
        }
      }
    },
    [tagInput, addTag]
  )

  // Handle featured image upload
  const handleFeaturedImageUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      setIsUploadingImage(true)
      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/admin/articles/upload-image', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Error al subir imagen')
        }

        const { url } = await res.json()
        onUpdate('images', [url])

        // Auto-detect image dimensions for article listings
        const img = new window.Image()
        img.onload = () => {
          onUpdate('imgWidth', img.naturalWidth)
          onUpdate('imgHeight', img.naturalHeight)
        }
        img.src = url
      } catch (err) {
        alert(err.message || 'Error al subir imagen')
      } finally {
        setIsUploadingImage(false)
        // Reset file input
        e.target.value = ''
      }
    },
    [onUpdate]
  )

  // Format date for datetime-local input (remove seconds and timezone)
  const formatDateForInput = (dateStr) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      // Format as YYYY-MM-DDTHH:MM
      const year = d.getUTCFullYear()
      const month = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      const hours = String(d.getUTCHours()).padStart(2, '0')
      const minutes = String(d.getUTCMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    } catch {
      return ''
    }
  }

  const inputClass =
    'w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
  const rowLabelClass = 'text-sm font-medium text-gray-700 dark:text-gray-300'

  const title = classifyTitleLength(metadata.title)
  const summary = classifySummaryLength(metadata.summary)
  const hasTags = Array.isArray(metadata.tags) && metadata.tags.length > 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 space-y-4">
      {/* Title - full width */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className={rowLabelClass} htmlFor="article-title">
            Titulo
          </label>
          <span className={`text-xs tabular-nums ${TITLE_TONE[title.status]}`}>
            {title.count}/{TITLE_LIMIT}
          </span>
        </div>
        <input
          id="article-title"
          type="text"
          value={metadata.title}
          onChange={(e) => onUpdate('title', e.target.value)}
          onBlur={(e) => {
            const clean = collapseWhitespace(e.target.value)
            if (clean !== metadata.title) onUpdate('title', clean)
          }}
          placeholder="Titulo del articulo"
          className={`${inputClass} text-lg font-semibold`}
        />
        {title.status === 'warning' && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {`Titulo largo. Con "${TITLE_SUFFIX.trim()}" el resultado llega a ${title.rendered} caracteres y Google recorta cerca de ${SERP_TITLE_MAX}.`}
          </p>
        )}
      </div>

      {/* Grid: Date, Author */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Fecha</label>
          <input
            type="datetime-local"
            value={formatDateForInput(metadata.date)}
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                onUpdate('date', new Date(val).toISOString())
              }
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Autor</label>
          <select
            value={metadata.authors?.[0] || 'default'}
            onChange={(e) => onUpdate('authors', [e.target.value])}
            className={inputClass}
          >
            {authors.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
            {authors.length === 0 && <option value="default">default</option>}
          </select>
        </div>
      </div>

      {/* Tags with autocomplete */}
      <div>
        <label className={labelClass}>Etiquetas</label>
        <div className="relative">
          <input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={handleTagInputChange}
            onKeyDown={handleTagKeyDown}
            onFocus={() => {
              if (tagInput.trim() && tagSuggestions.length > 0) {
                setShowSuggestions(true)
              }
            }}
            placeholder="Escribe etiquetas separadas por comas..."
            className={inputClass}
          />
          {/* Autocomplete dropdown */}
          {showSuggestions && tagSuggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto"
            >
              {tagSuggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        {!hasTags && (
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            Requerido para publicar. Un articulo sin etiquetas queda fuera de todas las paginas de
            temas.
          </p>
        )}
        {/* Selected tags as pills */}
        {metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {metadata.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-blue-900 dark:hover:text-blue-100"
                  aria-label={`Eliminar etiqueta ${tag}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className={rowLabelClass} htmlFor="article-summary">
            Resumen
          </label>
          <span className={`text-xs tabular-nums ${SUMMARY_TONE[summary.status]}`}>
            {summary.count} / {SUMMARY_MIN_GOOD}-{SUMMARY_MAX_GOOD}
          </span>
        </div>
        <textarea
          id="article-summary"
          value={metadata.summary}
          onChange={(e) => onUpdate('summary', e.target.value)}
          onBlur={(e) => {
            const clean = collapseWhitespace(e.target.value)
            if (clean !== metadata.summary) onUpdate('summary', clean)
          }}
          placeholder="Resumen breve del articulo"
          rows={3}
          className={inputClass}
        />
        <p className={`mt-1 text-xs ${SUMMARY_TONE[summary.status]}`}>
          {SUMMARY_HINTS[summary.status]}
        </p>
      </div>

      {/* SERP preview */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Vista previa en Google
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">{SERP_URL_LABEL}</p>
        <p className="text-base leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
          {truncateForSerp(renderedTitle(metadata.title), SERP_TITLE_MAX)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {summary.count > 0
            ? truncateForSerp(metadata.summary, SERP_DESCRIPTION_MAX)
            : 'Sin resumen. Google elegira un fragmento cualquiera del articulo.'}
        </p>
      </div>

      {/* Featured Image */}
      <div>
        <label className={labelClass}>Imagen destacada</label>
        <div className="flex items-start gap-4">
          {metadata.images?.[0] && (
            <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={metadata.images[0]}
                alt="Imagen destacada"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors">
              {isUploadingImage ? 'Subiendo...' : 'Seleccionar imagen'}
              <input
                type="file"
                accept="image/*"
                onChange={handleFeaturedImageUpload}
                className="hidden"
                disabled={isUploadingImage}
              />
            </label>
            {metadata.images?.[0] && (
              <button
                type="button"
                onClick={() => {
                  onUpdate('images', [])
                  onUpdate('imgWidth', null)
                  onUpdate('imgHeight', null)
                }}
                className="text-xs text-red-600 dark:text-red-400 hover:underline text-left"
              >
                Eliminar imagen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
