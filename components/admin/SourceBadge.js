// components/admin/SourceBadge.js
// Payment source badge component

const sourceConfig = {
  ath_movil: {
    label: 'ATH Movil',
    classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  paypal: {
    label: 'PayPal',
    classes: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
}

/**
 * Renders a pill-shaped badge indicating payment source
 * @param {Object} props
 * @param {'ath_movil' | 'paypal'} props.source - Payment source identifier
 * @returns {JSX.Element}
 */
export function SourceBadge({ source }) {
  const config = sourceConfig[source]

  if (!config) {
    // Fallback for unknown sources - display raw value with gray styling
    return (
      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
        {source}
      </span>
    )
  }

  return (
    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.classes}`}>
      {config.label}
    </span>
  )
}

export default SourceBadge
