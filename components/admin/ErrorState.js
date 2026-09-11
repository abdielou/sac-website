'use client'

import React from 'react'

/**
 * ErrorState - Error display with Spanish message and retry button
 * Used in dashboard for API fetch failures
 */

/**
 * @param {Object} props
 * @param {string} [props.message='Error al cargar los datos'] - Error message to display
 * @param {Function} [props.onRetry] - Callback when retry button clicked
 * @param {string} [props.actionLabel='Reintentar']
 * @param {Function} [props.onSecondaryAction] - Optional secondary action
 * @param {string} [props.secondaryActionLabel='Volver']
 */
export function ErrorState({
  message = 'Error al cargar los datos',
  onRetry,
  actionLabel = 'Reintentar',
  onSecondaryAction,
  secondaryActionLabel = 'Volver',
}) {
  const rawMessage =
    typeof message === 'string' && message.trim()
      ? message
      : typeof message?.message === 'string' && message.message.trim()
        ? message.message
        : 'Error al cargar los datos'
  const withoutWorkflowPrefix = rawMessage
    .replace(/^Workflow run\s+(?:"[^"]+"|'[^']+'|\S+)\s+failed:\s*/i, '')
    .trim()
  const displayMessage =
    !withoutWorkflowPrefix || /\b(?:wrun|run)_[a-z0-9_-]+\b/i.test(withoutWorkflowPrefix)
      ? 'No se pudo completar la solicitud. Intenta nuevamente.'
      : withoutWorkflowPrefix

  return (
    <div
      className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-red-600 dark:text-red-400 mb-4">{displayMessage}</p>
      {(onRetry || onSecondaryAction) && (
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              {actionLabel}
            </button>
          )}
          {onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="px-4 py-2 rounded-lg border border-red-300 bg-white text-red-700 transition-colors hover:bg-red-50 dark:border-red-700 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/30"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ErrorState
