// components/admin/SkeletonTable.js
// Responsive loading skeleton - cards on mobile, table on desktop

/**
 * Renders a pulsing placeholder for loading states
 * Shows cards on mobile, table on desktop
 * @param {Object} props
 * @param {number} [props.rows=5] - Number of rows/cards
 * @param {number} [props.columns=4] - Number of table columns (desktop only)
 * @returns {JSX.Element}
 */
export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <>
      {/* Mobile skeleton cards */}
      <div className="md:hidden space-y-4 animate-pulse">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32" />
                <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-48" />
              </div>
              <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-16" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-24" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop skeleton table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden animate-pulse">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <th key={colIndex} className="px-6 py-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: columns }).map((_, colIndex) => (
                    <td key={colIndex} className="px-6 py-4">
                      <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default SkeletonTable
