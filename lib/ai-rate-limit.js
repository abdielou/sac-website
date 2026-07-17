import { NextResponse } from 'next/server'

const WORKFLOW_START_WINDOW_MS = 60 * 1000
const MAX_WORKFLOWS_PER_WINDOW = 5

// MVP: in-memory rate limiting. For multi-instance production, replace with a shared store.
const startTimestampsByUser = new Map() // Map<string, number[]>

/**
 * Per-user rate limit for starting AI workflows (validate + generate share one bucket).
 * @param {string} userEmail
 * @returns {NextResponse|null} 429 response when exceeded, otherwise null
 */
export function checkWorkflowStartRateLimit(userEmail) {
  if (!userEmail) return null

  const now = Date.now()
  const timestamps = startTimestampsByUser.get(userEmail) || []
  const recent = timestamps.filter((ts) => now - ts < WORKFLOW_START_WINDOW_MS)
  recent.push(now)

  if (recent.length > MAX_WORKFLOWS_PER_WINDOW) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes', details: 'Rate limit excedido' },
      { status: 429 }
    )
  }

  startTimestampsByUser.set(userEmail, recent)
  return null
}
