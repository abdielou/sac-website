'use client'

import { useState, useEffect, useCallback } from 'react'
import hubbleImages from '@/data/catalog/hubble-images.json'

const EQUIPMENT_LABELS = {
  telescopio_inteligente: {
    label: 'Telescopio inteligente',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  equipo_pequeno: {
    label: 'Equipo pequeño',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  telescopio_grande: {
    label: 'Telescopio grande',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  dslr: {
    label: 'Cámara DSLR',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
}

const DIFFICULTY_LABELS = {
  facil: {
    label: 'Facil',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  intermedio: {
    label: 'Intermedio',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  retante: { label: 'Retante', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
}

const LOCATION_LABELS = {
  ciudad: {
    label: 'Ciudad',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  },
  suburbios: {
    label: 'Suburbios',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  oscuro: {
    label: 'Oscuro',
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  },
}

function Tag({ label, color }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {label}
    </span>
  )
}

/**
 * Format time for display. Handles both "8:00 PM" and "20:00" formats.
 * Returns "8:00 PM" style output.
 */
function formatTime(timeStr) {
  if (!timeStr) return ''
  // Already in 12h format
  if (/AM|PM/i.test(timeStr)) return timeStr
  // Convert 24h to 12h
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return timeStr
  let hours = parseInt(match[1], 10)
  const mins = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'
  if (hours === 0) hours = 12
  else if (hours > 12) hours -= 12
  return `${hours}:${mins} ${period}`
}

function getSkyViewUrl(ra, dec, pixels = 150) {
  return `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Position=${ra},${dec}&Survey=DSS&Return=JPEG&Pixels=${pixels}`
}

function getLargeImageUrl(objectId, catalog) {
  const hubbleId = hubbleImages[objectId]
  if (hubbleId) return `https://cdn.esahubble.org/archives/images/screen/${hubbleId}.jpg`
  if (catalog?.ra != null && catalog?.dec != null) return getSkyViewUrl(catalog.ra, catalog.dec, 600)
  return null
}

function ObjectModal({ entry, catalog, onClose }) {
  const displayName = getDisplayName(catalog)
  const catalogIds = getCatalogIds(catalog)
  const largeImg = getLargeImageUrl(entry.objectId, catalog)
  const hubbleId = hubbleImages[entry.objectId]

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Large image */}
        {largeImg && (
          <div className="w-full aspect-[4/3] bg-black rounded-t-2xl overflow-hidden">
            <img
              src={largeImg}
              alt={`Vista de ${displayName}`}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Details */}
        <div className="p-6 space-y-4">
          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{displayName}</h2>
            {catalogIds && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{catalogIds}</p>
            )}
            {catalog.objectType && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{catalog.objectType}</p>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {entry.difficulty && DIFFICULTY_LABELS[entry.difficulty] && (
              <Tag {...DIFFICULTY_LABELS[entry.difficulty]} />
            )}
            {entry.equipment && EQUIPMENT_LABELS[entry.equipment] && (
              <Tag {...EQUIPMENT_LABELS[entry.equipment]} />
            )}
            {entry.location && LOCATION_LABELS[entry.location] && (
              <Tag {...LOCATION_LABELS[entry.location]} />
            )}
          </div>

          {/* Data grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {catalog.magnitude != null && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Magnitud</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {catalog.magnitude}
                </p>
              </div>
            )}
            {catalog.angularSize != null && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Tamaño angular</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {typeof catalog.angularSize === 'object'
                    ? `${catalog.angularSize.major}' × ${catalog.angularSize.minor}'`
                    : `${catalog.angularSize}'`}
                </p>
              </div>
            )}
            {catalog.constellation && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Constelación</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {catalog.constellation}
                </p>
              </div>
            )}
            {entry.optimalTime && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Hora óptima</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatTime(entry.optimalTime)}
                </p>
              </div>
            )}
            {catalog.ra != null && catalog.dec != null && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Coordenadas (RA / Dec)</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {catalog.ra.toFixed(4)}° / {catalog.dec.toFixed(4)}°
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          {entry.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notas</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{entry.notes}</p>
            </div>
          )}

          {/* Image credit */}
          {hubbleId && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Imagen: ESA/Hubble (
              <a
                href={`https://esahubble.org/images/${hubbleId}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                {hubbleId}
              </a>
              , CC BY 4.0)
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function getDisplayName(catalog) {
  return catalog.commonNameEs || catalog.commonName || catalog.name
}

function getCatalogIds(catalog) {
  const ids = []
  if (catalog.catalogIds?.messier) ids.push(catalog.catalogIds.messier)
  if (catalog.catalogIds?.ngc) ids.push(catalog.catalogIds.ngc)
  if (ids.length === 0 && catalog.name) ids.push(catalog.name)
  return ids.join(' / ')
}

export default function ObjectCard({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const { catalog } = entry

  // No catalog data — minimal card
  if (!catalog) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        <p className="font-semibold text-gray-900 dark:text-gray-100">{entry.objectId}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Datos no disponibles</p>
      </div>
    )
  }

  const displayName = getDisplayName(catalog)
  const catalogIds = getCatalogIds(catalog)

  return (
    <>
    <div
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col sm:flex-row cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all"
      onClick={() => setModalOpen(true)}
    >
      {/* Object thumbnail — ESA/Hubble color if available, SkyView grayscale fallback */}
      <div className="flex-shrink-0 sm:w-[150px] sm:h-[150px] bg-gray-100 dark:bg-gray-900">
        <img
          src={entry.imageUrl || getSkyViewUrl(catalog.ra, catalog.dec)}
          alt={`Vista de ${displayName}`}
          loading="lazy"
          className="w-full h-40 sm:w-[150px] sm:h-[150px] object-cover"
        />
      </div>

      {/* Content */}
      <div className="p-3 flex-1 min-w-0">
        {/* Name */}
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</h3>
        {catalogIds && <p className="text-xs text-gray-500 dark:text-gray-400">{catalogIds}</p>}

        {/* Key data */}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
          {catalog.magnitude != null && <span>Mag: {catalog.magnitude}</span>}
          {catalog.angularSize != null && (
            <span>
              Tam:{' '}
              {typeof catalog.angularSize === 'object'
                ? catalog.angularSize.major
                : catalog.angularSize}
              &apos;
            </span>
          )}
          {catalog.constellation && <span>{catalog.constellation}</span>}
        </div>

        {/* Tags */}
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.equipment && EQUIPMENT_LABELS[entry.equipment] && (
            <Tag {...EQUIPMENT_LABELS[entry.equipment]} />
          )}
          {entry.difficulty && DIFFICULTY_LABELS[entry.difficulty] && (
            <Tag {...DIFFICULTY_LABELS[entry.difficulty]} />
          )}
          {entry.location && LOCATION_LABELS[entry.location] && (
            <Tag {...LOCATION_LABELS[entry.location]} />
          )}
        </div>

        {/* Optimal time */}
        {entry.optimalTime && (
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Hora óptima: {formatTime(entry.optimalTime)}
          </p>
        )}

        {/* Notes */}
        {entry.notes && (
          <div className="mt-1">
            <p
              className={`text-xs text-gray-500 dark:text-gray-400 ${!expanded ? 'line-clamp-2' : ''}`}
            >
              {entry.notes}
            </p>
            {entry.notes.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
              >
                {expanded ? 'Ver menos' : 'Ver mas'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    {modalOpen && <ObjectModal entry={entry} catalog={catalog} onClose={() => setModalOpen(false)} />}
    </>
  )
}
