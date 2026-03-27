'use client'

import { useState } from 'react'

/**
 * Difficulty, equipment, and location option values for guide entry annotations.
 */
const DIFFICULTY_OPTIONS = [
  { value: '', label: '-- Dificultad --' },
  { value: 'facil', label: 'Facil' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'retante', label: 'Retante' },
]

const EQUIPMENT_OPTIONS = [
  { value: '', label: '-- Equipo --' },
  { value: 'tel. inteligente', label: 'Tel. inteligente' },
  { value: 'equipo pequeno', label: 'Equipo pequeno' },
  { value: 'tel. tradicional', label: 'Tel. tradicional' },
  { value: 'tel. mediano', label: 'Tel. mediano' },
  { value: 'tel. med-grande', label: 'Tel. med-grande' },
  { value: 'tel. grande', label: 'Tel. grande' },
  { value: 'telescopio grande', label: 'Telescopio grande' },
]

const LOCATION_OPTIONS = [
  { value: '', label: '-- Ubicacion --' },
  { value: 'ciudad', label: 'Ciudad' },
  { value: 'suburbios', label: 'Suburbios' },
  { value: 'oscuro', label: 'Cielo oscuro' },
]

/**
 * GuideObjectRow - A single object row in the guide editor.
 * Shows the object display name and annotation fields for difficulty, equipment, location, time, and notes.
 *
 * @param {Object} entry - Guide entry with objectId, annotations, and _catalogData
 * @param {number} index - Position in the entries array
 * @param {number} total - Total number of entries
 * @param {Function} onUpdate - Called with (index, updatedEntry) when annotations change
 * @param {Function} onRemove - Called with (index) when object is removed
 * @param {Function} onMoveUp - Called with (index) to move up
 * @param {Function} onMoveDown - Called with (index) to move down
 */
export default function GuideObjectRow({
  entry,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const [expanded, setExpanded] = useState(true)

  const cat = entry._catalogData || {}
  const name = cat.commonNameEs || cat.commonName || cat.name || entry.objectId

  const catalogIds = []
  if (cat.catalogIds) {
    if (cat.catalogIds.messier) catalogIds.push(`M ${cat.catalogIds.messier}`)
    if (cat.catalogIds.ngc) catalogIds.push(`NGC ${cat.catalogIds.ngc}`)
    if (cat.catalogIds.ic) catalogIds.push(`IC ${cat.catalogIds.ic}`)
  }
  const idsStr = catalogIds.join(' / ') || entry.objectId

  const handleChange = (field, value) => {
    onUpdate(index, { ...entry, [field]: value })
  }

  const selectClass =
    'px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const inputClass =
    'px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      {/* Header row: object name, reorder, remove */}
      <div className="flex items-center gap-2">
        {/* Index badge */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300">
          {index + 1}
        </span>

        {/* Object name + IDs */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {idsStr}
            {cat.objectType && <span className="ml-2">{cat.objectType}</span>}
          </p>
        </button>

        {/* Annotation summary when collapsed */}
        {!expanded && (entry.difficulty || entry.equipment || entry.location) && (
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {entry.difficulty && (
              <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {entry.difficulty}
              </span>
            )}
            {entry.equipment && (
              <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                {entry.equipment}
              </span>
            )}
          </div>
        )}

        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mover arriba"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={index === total - 1}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mover abajo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex-shrink-0 p-1 text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          aria-label="Eliminar objeto"
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
      </div>

      {/* Expanded annotation fields */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
          {/* Row 1: difficulty, equipment, location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={entry.difficulty || ''}
              onChange={(e) => handleChange('difficulty', e.target.value)}
              className={selectClass}
            >
              {DIFFICULTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={entry.equipment || ''}
              onChange={(e) => handleChange('equipment', e.target.value)}
              className={selectClass}
            >
              {EQUIPMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={entry.location || ''}
              onChange={(e) => handleChange('location', e.target.value)}
              className={selectClass}
            >
              {LOCATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: optimal time */}
          <input
            type="text"
            value={entry.optimalTime || ''}
            onChange={(e) => handleChange('optimalTime', e.target.value)}
            placeholder="Ej: 9:00 PM - 11:00 PM"
            className={`w-full ${inputClass}`}
          />

          {/* Row 3: notes */}
          <textarea
            value={entry.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Notas sobre el objeto..."
            rows={2}
            className={`w-full ${inputClass} resize-none`}
          />
        </div>
      )}
    </div>
  )
}
