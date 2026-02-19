// lib/api-permissions.js
import { NextResponse } from 'next/server'
import { canPerformAction } from './permissions.js'

/**
 * Check if the authenticated user has permission to perform an action
 * Returns a 403 response if permission is denied, null if allowed
 *
 * @param {object} req - NextAuth request object with auth property
 * @param {string} action - Action from Actions enum
 * @returns {NextResponse|null} - 403 response if denied, null if allowed
 */
export function checkPermission(req, action) {
  if (!req.auth?.user?.email) {
    return NextResponse.json(
      {
        error: 'No autenticado',
        details: 'Authentication required',
      },
      { status: 401 }
    )
  }

  const userEmail = req.auth.user.email
  const hasPermission = canPerformAction(userEmail, action)

  if (!hasPermission) {
    console.warn(`Permission denied: ${userEmail} attempted ${action}`)
    return NextResponse.json(
      {
        error: 'Permiso denegado',
        details: `You do not have permission to perform this action: ${action}`,
      },
      { status: 403 }
    )
  }

  return null // Permission granted
}

/**
 * Middleware wrapper that checks permission before executing handler
 *
 * @param {string} action - Action from Actions enum
 * @param {Function} handler - Async handler function to execute if permission granted
 * @returns {Function} - Wrapped handler function
 */
export function requirePermission(action, handler) {
  return async (req, ...args) => {
    const permissionError = checkPermission(req, action)
    if (permissionError) {
      return permissionError
    }
    return handler(req, ...args)
  }
}
