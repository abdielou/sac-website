/**
 * MembersSidePanel - Scrollable member list for map view sidebar
 * Shows members grouped by location availability with visual indicators
 *
 * @param {Object} props
 * @param {Array} props.members - Array of member objects to display
 * @param {Function} props.onMemberClick - Callback when a member is clicked
 * @param {number|null} props.radiusKm - Current radius in km (when circle is active)
 * @param {Function} props.onRadiusChange - Callback to change radius value
 * @param {Function} props.onClearRadius - Callback to clear the circle filter
 * @param {boolean} props.isFiltered - Whether circle filtering is active
 */
export default function MembersSidePanel({
  members = [],
  onMemberClick,
  radiusKm = null,
  onRadiusChange,
  onClearRadius,
  isFiltered = false,
}) {
  if (members.length === 0 && !isFiltered) {
    return (
      <div className="h-[calc(100vh-280px)] flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Miembros</span>
            <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full px-2">
              0
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay miembros para mostrar</p>
        </div>
      </div>
    )
  }

  const withLocation = members.filter((m) => m.geoLat != null && m.geoLng != null)
  const withoutLocation = members.filter((m) => m.geoLat == null || m.geoLng == null)

  const fullName = (member) =>
    [member.firstName, member.initial, member.lastName, member.slastName]
      .filter(Boolean)
      .join(' ') || '-'

  const MemberItem = ({ member }) => (
    <div
      className={`px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0${onMemberClick ? ' cursor-pointer' : ''}`}
      onClick={onMemberClick ? () => onMemberClick(member) : undefined}
    >
      <p className="text-sm text-gray-900 dark:text-white truncate">{fullName(member)}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{member.town || '-'}</p>
    </div>
  )

  const NoLocationItem = ({ member }) => (
    <div
      className={`px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0${onMemberClick ? ' cursor-pointer' : ''}`}
      onClick={onMemberClick ? () => onMemberClick(member) : undefined}
    >
      <p className="text-sm text-gray-900 dark:text-white truncate">{fullName(member)}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{member.town || '-'}</p>
      <p className="text-xs text-amber-500 dark:text-amber-400">Sin coordenadas</p>
    </div>
  )

  return (
    <div className="h-[calc(100vh-280px)] flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Fixed header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Miembros</span>
          <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full px-2">
            {members.length}
            {isFiltered && (
              <span className="ml-1 text-blue-500 dark:text-blue-400">(filtrado)</span>
            )}
          </span>
        </div>
      </div>

      {/* Radius control bar */}
      {isFiltered && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={radiusKm}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
              className="flex-1 h-1.5 cursor-pointer"
              style={{ accentColor: '#3b82f6' }}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {radiusKm} km
            </span>
            <button
              onClick={onClearRadius}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Quitar filtro de radio"
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
        </div>
      )}

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {withLocation.map((member, index) => (
          <MemberItem key={member.email || index} member={member} />
        ))}

        {withoutLocation.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0">
              Sin ubicacion ({withoutLocation.length})
            </div>
            {withoutLocation.map((member, index) => (
              <NoLocationItem key={member.email || `no-loc-${index}`} member={member} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
