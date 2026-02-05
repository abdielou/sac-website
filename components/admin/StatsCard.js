'use client'

/**
 * StatsCard - Clickable stat card for dashboard with Link wrapper
 * Displays a label and pre-formatted value with configurable color
 */
import Link from 'next/link'

const colorClasses = {
  green: 'text-green-600 dark:text-green-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  red: 'text-red-600 dark:text-red-400',
  gray: 'text-gray-900 dark:text-white',
}

/**
 * @param {Object} props
 * @param {string} props.label - Spanish label text (e.g., "Miembros Activos")
 * @param {string} props.value - Pre-formatted value (already formatted with formatNumber/formatCurrency)
 * @param {string|Object} props.href - Link destination (string or { pathname, query })
 * @param {string} [props.color='gray'] - Value text color: 'green', 'yellow', 'red', 'gray'
 */
export function StatsCard({ label, value, href, color = 'gray' }) {
  const valueColorClass = colorClasses[color] || colorClasses.gray

  return (
    <Link href={href} className="block">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow">
        {/* Label */}
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {/* Value */}
        <p className={`mt-2 text-3xl font-bold ${valueColorClass}`}>{value}</p>
      </div>
    </Link>
  )
}

export default StatsCard
