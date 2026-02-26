'use client'

/**
 * ViewToggle - Grid/Map view toggle buttons
 * Purely presentational component for switching between grid and map views
 *
 * @param {Object} props
 * @param {'grid' | 'map'} props.viewMode - Current active view mode
 * @param {(mode: 'grid' | 'map') => void} props.onToggle - Callback when view mode changes
 */
export default function ViewToggle({ viewMode, onToggle }) {
  const activeClasses = 'bg-blue-600 text-white'
  const inactiveClasses =
    'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden inline-flex">
      <button
        onClick={() => onToggle('grid')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
          viewMode === 'grid' ? activeClasses : inactiveClasses
        }`}
        title="Vista de grilla"
      >
        {/* Grid icon - 3x3 grid pattern */}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="5" height="5" rx="1" />
          <rect x="10" y="3" width="5" height="5" rx="1" />
          <rect x="17" y="3" width="5" height="5" rx="1" />
          <rect x="3" y="10" width="5" height="5" rx="1" />
          <rect x="10" y="10" width="5" height="5" rx="1" />
          <rect x="17" y="10" width="5" height="5" rx="1" />
          <rect x="3" y="17" width="5" height="5" rx="1" />
          <rect x="10" y="17" width="5" height="5" rx="1" />
          <rect x="17" y="17" width="5" height="5" rx="1" />
        </svg>
        Grilla
      </button>
      <button
        onClick={() => onToggle('map')}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
          viewMode === 'map' ? activeClasses : inactiveClasses
        }`}
        title="Vista de mapa"
      >
        {/* Map pin icon */}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
        </svg>
        Mapa
      </button>
    </div>
  )
}
