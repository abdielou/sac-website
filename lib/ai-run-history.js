import { buildUserKey } from './run-history-store'

const HISTORY_SCHEMA_VERSION = 1

function buildInputSummary(input) {
  if (!input || typeof input !== 'object') return {}

  return {
    platform: input.platform,
    contentType: input.contentType,
    draftTextLength: typeof input.draftText === 'string' ? input.draftText.length : 0,
    imageCount: Array.isArray(input.images) ? input.images.length : 0,
    hasGoal: Boolean(input.goal),
    hasAudience: Boolean(input.audience),
    hasCta: Boolean(input.cta),
    hasEventDetails: Boolean(input.eventDetails),
    hasAltText: Boolean(input.altText),
  }
}

function buildGenerationInputSummary(input) {
  if (!input || typeof input !== 'object') return {}

  const platforms = Array.isArray(input.platforms) ? input.platforms : []

  return {
    platforms,
    contentType: input.contentType,
    intentLength: typeof input.intent === 'string' ? input.intent.length : 0,
    topicLength: typeof input.topic === 'string' ? input.topic.length : 0,
    hasTone: Boolean(input.tone),
    hasAudience: Boolean(input.audience),
    hasCta: Boolean(input.cta),
    hasKnownFacts: Array.isArray(input.knownFacts) && input.knownFacts.length > 0,
    hasEventDetails: Boolean(input.eventDetails),
    hasHashtags: Array.isArray(input.hashtags) && input.hashtags.length > 0,
    hasLinks: Array.isArray(input.links) && input.links.length > 0,
    hasImageStyle: Boolean(input.imageStyle),
    hasImageConstraints: Boolean(input.imageConstraints),
  }
}

function buildOutcomeSummary(result) {
  if (!result || typeof result !== 'object') return undefined

  const issues = Array.isArray(result.issues) ? result.issues : []
  const issueCounts = issues.reduce(
    (acc, issue) => {
      const sev = issue?.severity
      if (sev === 'critical' || sev === 'major' || sev === 'minor') {
        acc[sev] += 1
      }
      return acc
    },
    { critical: 0, major: 0, minor: 0 }
  )

  return {
    overallOutcome: result.overallOutcome,
    approvalRecommendation: result.approvalRecommendation,
    issueCount: issues.length,
    issueCounts,
  }
}

function buildGenerationOutcomeSummary(result) {
  if (!result || typeof result !== 'object') return undefined

  const drafts = Array.isArray(result.drafts) ? result.drafts : []
  const platforms = drafts.map((d) => d?.platform).filter(Boolean)
  const hasMissingInformation = drafts.some(
    (d) => Array.isArray(d?.missingInformation) && d.missingInformation.length > 0
  )

  return {
    draftCount: drafts.length,
    platforms,
    hasMissingInformation,
  }
}

function applyUsageFields(record, usage, model) {
  if (usage?.openRouterGenerationId) {
    record.openRouterGenerationId = usage.openRouterGenerationId
  }
  if (typeof usage?.promptTokens === 'number') {
    record.promptTokens = usage.promptTokens
  }
  if (typeof usage?.completionTokens === 'number') {
    record.completionTokens = usage.completionTokens
  }
  if (typeof usage?.totalTokens === 'number') {
    record.totalTokens = usage.totalTokens
  }
  if (usage?.cost && typeof usage.cost.amount === 'number') {
    record.cost = {
      amount: usage.cost.amount,
      currency: usage.cost.currency || 'USD',
    }
  }
  if (usage?.model || model) {
    record.model = usage?.model || model
  }
}

/**
 * Build sparse AiRunHistoryRecord for validation runs (no prompts, uploads, or secrets).
 */
export function buildValidationHistoryRecord({
  input,
  runId,
  status,
  result,
  error,
  startedAt,
  completedAt,
  guidelineVersion,
  model,
  provider = 'openrouter',
  usage,
}) {
  const userId = input?.userId
  const userKey = userId ? buildUserKey(userId) : undefined
  const createdAt = startedAt || new Date().toISOString()
  const finishedAt = completedAt || new Date().toISOString()
  const durationMs =
    startedAt && completedAt
      ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
      : undefined

  const record = {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    runId,
    mode: 'validate',
    status,
    userKey,
    userId: userId || undefined,
    createdAt,
    completedAt: finishedAt,
    durationMs,
    platform: input?.platform,
    contentType: input?.contentType,
    guidelineVersion,
    provider,
    inputSummary: buildInputSummary(input),
  }

  applyUsageFields(record, usage, model)

  if (status === 'completed' && result) {
    record.validationOutcome = result.overallOutcome
    record.outcomeSummary = buildOutcomeSummary(result)
  }

  if (status === 'failed' && error) {
    record.error = {
      message:
        typeof error === 'string'
          ? error.slice(0, 200)
          : String(error?.message || 'failed').slice(0, 200),
      retryable: Boolean(error?.retryable),
    }
  }

  return record
}

/**
 * Build sparse AiRunHistoryRecord for generation runs (no full prompts or draft text).
 */
export function buildGenerationHistoryRecord({
  input,
  runId,
  status,
  result,
  error,
  startedAt,
  completedAt,
  guidelineVersion,
  model,
  provider = 'openrouter',
  usage,
}) {
  const userId = input?.userId
  const userKey = userId ? buildUserKey(userId) : undefined
  const createdAt = startedAt || new Date().toISOString()
  const finishedAt = completedAt || new Date().toISOString()
  const durationMs =
    startedAt && completedAt
      ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
      : undefined

  const platforms = Array.isArray(input?.platforms) ? input.platforms : undefined

  const record = {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    runId,
    mode: 'generate',
    status,
    userKey,
    userId: userId || undefined,
    createdAt,
    completedAt: finishedAt,
    durationMs,
    platform: platforms?.length === 1 ? platforms[0] : undefined,
    contentType: input?.contentType,
    guidelineVersion,
    provider,
    inputSummary: buildGenerationInputSummary(input),
  }

  applyUsageFields(record, usage, model)

  if (status === 'completed' && result) {
    record.outcomeSummary = buildGenerationOutcomeSummary(result)
  }

  if (status === 'failed' && error) {
    record.error = {
      message:
        typeof error === 'string'
          ? error.slice(0, 200)
          : String(error?.message || 'failed').slice(0, 200),
      retryable: Boolean(error?.retryable),
    }
  }

  return record
}
