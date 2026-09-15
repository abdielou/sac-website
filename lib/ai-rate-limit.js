import { NextResponse } from 'next/server'

const WORKFLOW_START_WINDOW_MS = 60 * 1000
const MAX_WORKFLOWS_PER_WINDOW = 5

// Best-effort, process-local limiter. Each server instance or cold start keeps
// its own counter, so a multi-instance deployment can exceed the cap by a factor
// of the instance count. The hard guard against runaway paid calls is the
// single-active-run lease in lib/ai-run-lease-store.js, which is S3-coordinated
// and allows one run per user at a time regardless of instance.
const startTimestampsByUser = new Map() // Map<string, number[]>

/**
 * Per-user, per-process rate limit for starting AI workflows (validate + generate
 * share one bucket). A rejected call is not recorded, so a burst does not extend
 * the window. Callers must still reserve the run lease; this limiter only trims
 * bursts within one instance.
 * @param {string} userEmail
 * @returns {NextResponse|null} 429 response when exceeded, otherwise null
 */
export function checkWorkflowStartRateLimit(userEmail) {
  if (!userEmail) return null

  const now = Date.now()
  const timestamps = startTimestampsByUser.get(userEmail) || []
  const recent = timestamps.filter((timestamp) => now - timestamp < WORKFLOW_START_WINDOW_MS)
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

export function __resetWorkflowStartRateLimitForTests() {
  startTimestampsByUser.clear()
}
