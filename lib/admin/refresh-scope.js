// lib/admin/refresh-scope.js
// Maps the admin section being viewed to what a refresh must clear.
// Shared by the header refresh hook and the refresh API route.

import { CACHE_KEYS } from '../cache'

/**
 * Sections with server-side cached data. `all` flushes everything and is
 * the fallback for sections without a cache, such as articles or media.
 */
export const REFRESH_SCOPES = {
  members: { cacheKeys: [CACHE_KEYS.MEMBERS], queryKeys: [['members']] },
  payments: { cacheKeys: [CACHE_KEYS.PAYMENTS], queryKeys: [['payments']] },
  inquiries: { cacheKeys: [CACHE_KEYS.INQUIRIES], queryKeys: [['inquiries']] },
  all: {
    cacheKeys: null,
    queryKeys: [['members'], ['payments'], ['inquiries']],
  },
}

/**
 * Scope for an admin pathname. `/admin/inquiries` gives `inquiries`, the dashboard
 * and any section without its own cache give `all`.
 * @param {string|null|undefined} pathname
 * @returns {'members'|'payments'|'inquiries'|'all'}
 */
export function refreshScopeFor(pathname) {
  const section = String(pathname ?? '')
    .replace(/^\/admin\/?/, '')
    .split('/')[0]
  return section && section !== 'all' && REFRESH_SCOPES[section] ? section : 'all'
}

/**
 * Normalize a client-provided scope. Unknown values fall back to `all`.
 * @param {unknown} scope
 * @returns {'members'|'payments'|'inquiries'|'all'}
 */
export function normalizeRefreshScope(scope) {
  return typeof scope === 'string' && REFRESH_SCOPES[scope] ? scope : 'all'
}
