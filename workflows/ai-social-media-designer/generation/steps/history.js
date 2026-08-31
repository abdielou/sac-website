import { buildGenerationHistoryRecord } from '../../../../lib/ai-run-history'
import { persistAiRunFailure, persistRunHistory } from '../../../../lib/run-history-store'

/**
 * Build + persist history inside a step.
 * Node crypto (userKey hash) and AWS SDK are not allowed in the workflow VM.
 * Soft-fail: never rewrite client terminal status on history errors.
 */
export async function persistGenerationHistoryStep(payload) {
  'use step'
  try {
    const record = buildGenerationHistoryRecord(payload)
    const failure = payload.status === 'failed' ? payload.failure || payload.error : null
    await Promise.all([
      persistRunHistory(record),
      failure && payload.runId ? persistAiRunFailure(payload.runId, failure) : null,
    ])
  } catch (error) {
    console.error('generateAiWorkflow: failed to persist run terminal metadata', error)
  }
  return null
}
