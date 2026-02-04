// lib/cache.js
import NodeCache from 'node-cache'

// 5-minute TTL, check for expired entries every 60 seconds
export const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

/**
 * Get data from cache or fetch and cache it
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch data if not cached
 * @param {boolean} forceRefresh - If true, bypass cache and fetch fresh data
 * @returns {Promise<{data: any, fromCache: boolean}>}
 */
export async function getCachedData(key, fetchFn, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cache.get(key)
    if (cached !== undefined) {
      return { data: cached, fromCache: true }
    }
  }

  const data = await fetchFn()
  cache.set(key, data)
  return { data, fromCache: false }
}

/**
 * Invalidate specific key or flush all cache
 * @param {string} [key] - Specific key to delete, or undefined to flush all
 */
export function invalidateCache(key) {
  if (key) {
    cache.del(key)
  } else {
    cache.flushAll()
  }
}

export const CACHE_KEYS = {
  MEMBERS: 'members',
  PAYMENTS: 'payments',
}
