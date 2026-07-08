import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkReadAccess } from '../../../../../lib/api-permissions'
import { getWorld, getRun } from 'workflow/runtime'
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

async function getRunOwner(runId) {
  const world = await getWorld()
  const run = await world.runs.get(runId, { resolveData: 'all' })
  const hydrated = hydrateResourceIO(run, observabilityRevivers)
  return extractOwnerFromHydratedInput(hydrated)
}

function safeWorkflowErrorMessage(error) {
  // Avoid leaking internals; PRD says safe failures.
  const message = error?.message ? String(error.message) : ''
  if (!message) return 'La validación falló'
  return message.length > 200 ? `${message.slice(0, 200)}...` : message
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
  const userId = req.auth.user.id || req.auth.user.email

  if (!userEmail) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'No email en sesión' },
      { status: 401 }
    )
  }

  const runId = params?.runId
  if (!runId || typeof runId !== 'string') {
    return NextResponse.json({ error: 'runId requerido' }, { status: 400 })
  }

  // Ownership must be checked before returning any status/result to avoid leaking info.
  let owner
  try {
    owner = await getRunOwner(runId)
  } catch {
    // If run doesn't exist or can't be inspected, respond generically.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const matches = owner?.userId === String(userId) || owner?.userEmail?.toLowerCase() === userEmail

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

  if (status === 'completed') {
    const result = await run.returnValue
    return NextResponse.json({ runId, status, result }, { status: 200 })
  }

  if (status === 'failed') {
    try {
      await run.returnValue
    } catch (error) {
      return NextResponse.json(
        { runId, status, error: safeWorkflowErrorMessage(error) },
        { status: 200 }
      )
    }
    return NextResponse.json({ runId, status }, { status: 200 })
  }

  // pending / running / cancelled: just return status.
  return NextResponse.json({ runId, status }, { status: 200 })
})
