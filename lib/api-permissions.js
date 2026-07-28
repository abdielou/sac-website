// lib/api-permissions.js
import { NextResponse } from 'next/server'
import { canPerformAction, hasPermission } from './permissions.js'
import { resolveMemberAccess } from './member-access.js'

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
 * Check if user has read access to a feature.
 * @param {object} req - NextAuth request with auth
 * @param {string} feature - Feature name (members, payments, articles, guides)
 * @returns {NextResponse|null} - 403 if denied, null if allowed
 */
export function checkReadAccess(req, feature) {
  if (!req.auth?.user?.email) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const userEmail = req.auth.user.email
  if (!hasPermission(userEmail, `read_${feature}`)) {
    console.warn(`Read access denied: ${userEmail} tried to read ${feature}`)
    return NextResponse.json(
      { error: 'Permiso denegado', details: `No tienes acceso a ${feature}` },
      { status: 403 }
    )
  }

  return null
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

/**
 * Check whether the authenticated user may use the member portal.
 * Returns a 403 response if their membership is not current, null if allowed.
 *
 * Delegates the policy decision to resolveMemberAccess(); this wrapper only
 * maps a denial onto the wire.
 *
 * @param {object} req - NextAuth request object with auth property
 * @returns {Promise<NextResponse|null>} - 403 response if denied, null if allowed
 */
export async function checkMemberAccess(req) {
  const access = await resolveMemberAccess(req.auth)

  if (!access.allowed) {
    console.warn(`Member portal access denied (${access.reason})`)
    return NextResponse.json(
      { error: 'Membresia inactiva', details: `Access denied: ${access.reason}` },
      { status: 403 }
    )
  }

  return null
}
