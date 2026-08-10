export const AI_RUN_FAILURE_SCHEMA_VERSION = 1

const DEFAULT_CODE = 'workflow_failed'
const DEFAULT_STAGE = 'workflow'
const DEFAULT_MESSAGE = 'La ejecución de IA falló.'
const MAX_CODE_LENGTH = 80
const MAX_STAGE_LENGTH = 40
// Matches the legacy run API's 1,200-character message plus its ellipsis.
const MAX_MESSAGE_LENGTH = 1_203
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_.:-]*$/

function normalizeIdentifier(value, fallback, maxLength) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalized || normalized.length > maxLength || !IDENTIFIER_PATTERN.test(normalized)) {
    return fallback
  }
  return normalized
}

function normalizeMessage(value, fallback = DEFAULT_MESSAGE) {
  const normalized =
    typeof value === 'string'
      ? value
          .replace(/[\u0000-\u001f\u007f]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : ''
  return (normalized || fallback).slice(0, MAX_MESSAGE_LENGTH)
}

/**
 * Build the public, persistable failure contract. Extra fields from provider
 * responses, prompts, or Error objects are intentionally not copied.
 */
export function buildAiRunFailure({ code, stage, retryable = false, message } = {}) {
  return {
    schemaVersion: AI_RUN_FAILURE_SCHEMA_VERSION,
    code: normalizeIdentifier(code, DEFAULT_CODE, MAX_CODE_LENGTH),
    stage: normalizeIdentifier(stage, DEFAULT_STAGE, MAX_STAGE_LENGTH),
    retryable: retryable === true,
    message: normalizeMessage(message),
  }
}

/**
 * Strict read-time parser for a stored AiRunFailureV1 sidecar.
 */
export function parseAiRunFailure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.schemaVersion !== AI_RUN_FAILURE_SCHEMA_VERSION) return null
  if (typeof value.code !== 'string' || typeof value.stage !== 'string') return null
  if (typeof value.retryable !== 'boolean' || typeof value.message !== 'string') return null
  if (!value.message.trim()) return null

  const failure = buildAiRunFailure(value)
  if (failure.code !== value.code.trim().toLowerCase()) return null
  if (failure.stage !== value.stage.trim().toLowerCase()) return null
  return failure
}

export function buildLegacyAiRunFailure(message) {
  return buildAiRunFailure({
    code: DEFAULT_CODE,
    stage: DEFAULT_STAGE,
    retryable: false,
    message,
  })
}
