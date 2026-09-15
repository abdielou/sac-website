import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import { checkReadAccess } from '../../../../../../lib/api-permissions'
import { buildLegacyAiRunFailure } from '../../../../../../lib/ai-run-failure'
import { syncAiRunLeaseFromStatus } from '../../../../../../lib/ai-run-lease-store'
import { readAiRunFailure } from '../../../../../../lib/run-history-store'
import { applyTemplateRendersToWorkflowResult } from '../../../../../../lib/social-template/applyTemplateRendersToWorkflowResult'
import { getWorld } from 'workflow/runtime'
import { getRun } from 'workflow/api'
import { hydrateResourceIO, observabilityRevivers } from 'workflow/observability'

function extractOwnerFromHydratedInput(hydrated) {
  const input = hydrated?.input

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (typeof input.userId === 'string' || typeof input.userEmail === 'string') {
      return { userId: input.userId, userEmail: input.userEmail }
    }
  }

  if (
    Array.isArray(input) &&
    input.length > 0 &&
    typeof input[0] === 'object' &&
    input[0] !== null
  ) {
    const first = input[0]
    if (typeof first.userId === 'string' || typeof first.userEmail === 'string') {
      return { userId: first.userId, userEmail: first.userEmail }
    }
  }

  return null
}

function toIsoTimestamp(value) {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

async function inspectRun(runId) {
  const world = await getWorld()
  const run = await world.runs.get(runId, { resolveData: 'all' })
  const hydrated = hydrateResourceIO(run, observabilityRevivers)
  return {
    owner: extractOwnerFromHydratedInput(hydrated),
    createdAt: toIsoTimestamp(run.createdAt),
    startedAt: toIsoTimestamp(run.startedAt),
    updatedAt: toIsoTimestamp(run.updatedAt),
  }
}

export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Feature gate: view AI runs (read-only)
  const readError = checkReadAccess(req, 'ai')
  if (readError) return readError

  const userEmail = req.auth.user.email?.toLowerCase()
  const userId = req.auth.user.id || req.auth.user.email?.toLowerCase()

  if (!userEmail) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No email en sesión' },
      { status: 401 }
    )
  }

  const resolvedParams = await params
  const runId = resolvedParams?.runId
  if (!runId || typeof runId !== 'string') {
    return NextResponse.json({ error: 'runId requerido' }, { status: 400 })
  }

  // Ownership must be checked before returning any status/result to avoid leaking info.
  let inspection
  try {
    inspection = await inspectRun(runId)
  } catch {
    // If run doesn't exist or can't be inspected, respond generically.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const matches =
    inspection.owner?.userId === String(userId) ||
    inspection.owner?.userEmail?.toLowerCase() === userEmail

  if (!matches) {
    // PRD: 403/404 without leaking status/result/error details for forbidden/cross-user runId.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const run = getRun(runId)

  // If the run doesn't exist, keep response generic.
  try {
    if (!(await run.exists)) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const status = await run.status

  const leaseState = await syncAiRunLeaseFromStatus({
    userId: String(userId),
    runId,
    status,
  }).catch((error) => {
    console.error('GET /api/admin/ai/runs/[runId]: lease sync failed', error)
    return null
  })
  const leaseMetadata = leaseState
    ? { mode: leaseState.mode, coordination: leaseState.coordination }
    : {}

  if (status === 'completed') {
    const result = await run.returnValue
    const withTemplates = await applyTemplateRendersToWorkflowResult(result)
    return NextResponse.json(
      { runId, status, result: withTemplates, ...leaseMetadata },
      { status: 200 }
    )
  }

  if (status === 'failed') {
    const storedFailure = await readAiRunFailure(runId).catch((error) => {
      console.error(
        'GET /api/admin/ai/runs/[runId]: failure sidecar read failed',
        error?.code || error?.message || 'unknown_error'
      )
      return null
    })
    // A legacy Workflow error may contain provider bodies, paths, or other
    // diagnostics. Without our sanitized sidecar, expose only a safe fallback.
    const failure = storedFailure || buildLegacyAiRunFailure()

    return NextResponse.json(
      { runId, status, error: failure.message, failure, ...leaseMetadata },
      { status: 200 }
    )
  }

  // Timestamps let the client distinguish an active run from a stale local run
  // left behind when the development server was interrupted.
  return NextResponse.json(
    {
      runId,
      status,
      createdAt: inspection.createdAt,
      startedAt: inspection.startedAt,
      updatedAt: inspection.updatedAt,
      ...leaseMetadata,
    },
    { status: 200 }
  )
})
