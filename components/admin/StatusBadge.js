// components/admin/StatusBadge.js
// Membership status badge component with Spanish labels

const statusConfig = {
  active: {
    label: 'Activo',
    classes: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  'expiring-soon': {
    label: 'Vence pronto',
    classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  expired: {
    label: 'Expirado',
    classes: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  applied: {
    label: 'Aplicado',
    classes: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  },
}

/**
 * Renders a pill-shaped badge indicating membership status
 * @param {Object} props
 * @param {'active' | 'expiring-soon' | 'expired'} props.status - Membership status
 * @returns {JSX.Element}
 */
export function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.expired

  return (
    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.classes}`}>
      {config.label}
    </span>
  )
}

export default StatusBadge
