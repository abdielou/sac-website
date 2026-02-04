'use client'

/**
 * ErrorState - Error display with Spanish message and retry button
 * Used in dashboard for API fetch failures
 */

/**
 * @param {Object} props
 * @param {string} [props.message='Error al cargar los datos'] - Error message to display
 * @param {Function} props.onRetry - Callback when retry button clicked
 */
export function ErrorState({ message = 'Error al cargar los datos', onRetry }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
      <p className="text-red-600 dark:text-red-400 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}

export default ErrorState
