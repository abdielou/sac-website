/**
 * MembersSidePanel - Scrollable member list for map view sidebar
 * Shows members grouped by location availability with visual indicators
 */
export default function MembersSidePanel({ members = [], onMemberClick }) {
  if (members.length === 0) {
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
          </span>
        </div>
      </div>

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
