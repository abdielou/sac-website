// lib/email-table.js
// Client-side sort and filter helpers for the emails page. Pure functions.

export const STATUS_ORDER = { overdue: 0, pending: 1, answered: 2 }

const STATUSES = new Set(Object.keys(STATUS_ORDER))

/**
 * Keep only the threads with the given status. `all` or an unknown value
 * returns every thread.
 * @param {object[]} threads
 * @param {string} status
 * @returns {object[]}
 */
export function filterThreads(threads, status) {
  if (!STATUSES.has(status)) return threads
  return threads.filter((t) => t.status === status)
}

function replierOf(thread) {
  const last = thread.replies?.length ? thread.replies[thread.replies.length - 1] : null
  return last ? last.by : null
}

// Each key maps a thread to a comparable value. `null` means "missing" and
// sorts last in both directions.
const KEYS = {
  subject: (t) => t.subject?.toLowerCase() ?? null,
  sender: (t) => t.sender?.email ?? null,
  lastInboundAt: (t) => t.lastInboundAt ?? null,
  daysWaiting: (t) => (typeof t.daysWaiting === 'number' ? t.daysWaiting : null),
  status: (t) => STATUS_ORDER[t.status] ?? null,
  replier: (t) => replierOf(t),
}

function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/**
 * Return a new array sorted by `key` in `direction` (`asc` or `desc`).
 * Threads with a missing value stay at the end in both directions.
 * An unknown key returns a copy in the input order.
 * @param {object[]} threads
 * @param {string} key
 * @param {'asc'|'desc'} direction
 * @returns {object[]}
 */
export function sortThreads(threads, key, direction = 'asc') {
  const pick = KEYS[key]
  if (!pick) return [...threads]
  const sign = direction === 'desc' ? -1 : 1
  return threads
    .map((t, i) => ({ t, i, v: pick(t) }))
    .sort((x, y) => {
      if (x.v === null && y.v === null) return x.i - y.i
      if (x.v === null) return 1
      if (y.v === null) return -1
      return sign * compare(x.v, y.v) || x.i - y.i
    })
    .map((x) => x.t)
}
