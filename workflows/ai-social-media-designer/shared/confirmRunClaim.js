import { confirmAiRunClaim } from '../../../lib/ai-run-lease-store'

/**
 * Confirm the caller still owns the single-active-run claim before doing work.
 * Shared by the validate and generate workflows; `mode` distinguishes them.
 */
export async function confirmRunClaimStep(input, runId, mode) {
  'use step'
  if (!input?.runCoordination) return { ok: true, skipped: true }

  return confirmAiRunClaim({
    userId: input.userId,
    mode,
    claimId: input.runCoordination.claimId,
    runId,
    coordination: input.runCoordination.coordination,
  })
}
