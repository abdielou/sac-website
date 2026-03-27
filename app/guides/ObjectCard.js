'use client'

import { useState } from 'react'

const EQUIPMENT_LABELS = {
  telefono_inteligente: {
    label: 'Tel. inteligente',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  equipo_pequeno: {
    label: 'Equipo pequeno',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  telescopio_grande: {
    label: 'Telescopio grande',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
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

function getSkyViewUrl(ra, dec) {
  return `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Position=${ra},${dec}&Survey=DSS&Return=JPEG&Pixels=150`
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col sm:flex-row">
      {/* SkyView thumbnail */}
      <div className="flex-shrink-0 sm:w-[150px] sm:h-[150px] bg-gray-100 dark:bg-gray-900">
        <img
          src={getSkyViewUrl(catalog.ra, catalog.dec)}
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
          {catalog.angularSize != null && <span>Tam: {catalog.angularSize}&apos;</span>}
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
            Hora optima: {entry.optimalTime}
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
  )
}
