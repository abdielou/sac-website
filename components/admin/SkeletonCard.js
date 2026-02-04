/**
 * SkeletonCard - Loading placeholder for dashboard stat cards
 * Uses Tailwind animate-pulse for loading animation
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`animate-pulse p-6 bg-white dark:bg-gray-800 rounded-lg shadow ${className}`}
    >
      {/* Label placeholder */}
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
      {/* Value placeholder */}
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
    </div>
  )
}

export default SkeletonCard
