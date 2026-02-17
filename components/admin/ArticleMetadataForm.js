'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

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

  // Filter tag suggestions as user types
  const handleTagInputChange = useCallback(
    (e) => {
      const value = e.target.value
      setTagInput(value)

      if (value.trim()) {
        const lower = value.toLowerCase()
        const filtered = allTags.filter(
          (t) => t.toLowerCase().includes(lower) && !metadata.tags.includes(t)
        )
        setTagSuggestions(filtered)
        setShowSuggestions(true)
      } else {
        setTagSuggestions([])
        setShowSuggestions(false)
      }
    },
    [allTags, metadata.tags]
  )

  // Add a tag
  const addTag = useCallback(
    (tag) => {
      const trimmed = tag.trim()
      if (trimmed && !metadata.tags.includes(trimmed)) {
        onUpdate('tags', [...metadata.tags, trimmed])
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 space-y-4">
      {/* Title - full width */}
      <div>
        <label className={labelClass}>Titulo</label>
        <input
          type="text"
          value={metadata.title}
          onChange={(e) => onUpdate('title', e.target.value)}
          placeholder="Titulo del articulo"
          className={`${inputClass} text-lg font-semibold`}
        />
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
            placeholder="Escribe para buscar o crear etiquetas..."
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
        <label className={labelClass}>Resumen</label>
        <textarea
          value={metadata.summary}
          onChange={(e) => onUpdate('summary', e.target.value)}
          placeholder="Resumen breve del articulo"
          rows={2}
          className={inputClass}
        />
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
                onClick={() => onUpdate('images', [])}
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
