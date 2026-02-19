'use client'

import { useScan } from '@/lib/hooks/useAdminData'
import { useSession } from 'next-auth/react'

/**
 * ScanCard - Action card for triggering inbox scan from dashboard
 *
 * Displays a button to trigger Gmail inbox scanning for new payment emails.
 * Shows spinner while scanning, success/error/conflict feedback inline.
 *
 * States:
 * - idle: Ready to scan, button enabled
 * - scanning: Spinner + disabled button
 * - success: Green "Escaneo completado" message
 * - conflict: Yellow "scan in progress" with auto-retry
 * - error: Red error message with retry button
 */
export function ScanCard() {
  const { data: session } = useSession()
  const { scan, isScanning, status, error, reset } = useScan()
  
  const accessibleActions = session?.user?.accessibleActions || []
  const canScanInbox = accessibleActions.includes('scan_inbox')
  
  // If user doesn't have permission to scan inbox, don't render the card
  if (!canScanInbox) {
    return null
  }

  const handleClick = () => {
    if (status === 'error') {
      reset()
    }
    scan()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      {/* Label */}
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Escanear Inbox</p>

      {/* Status area */}
      <div className="mt-2 min-h-[1.75rem]">
        {status === 'idle' && !error && (
          <p className="text-sm text-gray-400 dark:text-gray-500">Buscar nuevos pagos en Gmail</p>
        )}

        {status === 'idle' && error && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">{error}</p>
        )}

        {status === 'scanning' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Esto puede tomar unos minutos...
          </p>
        )}

        {status === 'success' && (
          <p className="text-sm text-green-600 dark:text-green-400">Escaneo completado</p>
        )}

        {status === 'conflict' && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Escaneo en progreso, esperando...
          </p>
        )}

        {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {/* Action button */}
      <button
        onClick={handleClick}
        disabled={isScanning || status === 'conflict' || status === 'success'}
        className="w-full mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isScanning ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Escaneando...
          </span>
        ) : status === 'error' ? (
          'Reintentar'
        ) : (
          'Escanear'
        )}
      </button>
    </div>
  )
}

export default ScanCard
