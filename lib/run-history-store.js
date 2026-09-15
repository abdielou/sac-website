import crypto from 'crypto'
import AWS from 'aws-sdk'
import { buildAiRunFailure, parseAiRunFailure } from './ai-run-failure'

let s3Client = null
const localRunFailures = new Map()
const RUN_FAILURE_PREFIX = 'workflow-run-failures'
const MAX_RUN_ID_LENGTH = 200

function getRunHistoryS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

const getBucket = () => process.env.S3_ARTICLES_BUCKET_NAME

function normalizeRunId(runId) {
  const normalized = typeof runId === 'string' ? runId.trim() : ''
  if (!normalized || normalized.length > MAX_RUN_ID_LENGTH) {
    throw new TypeError('runId is required')
  }
  return normalized
}

function isNotFoundError(error) {
  return error?.code === 'NoSuchKey' || error?.code === 'NotFound' || error?.statusCode === 404
}

function warnFailureFallback(action, error) {
  console.warn(
    `run-history-store: failed to ${action} AI run failure sidecar; using local fallback`,
    error?.code || error?.message || 'unknown_error'
  )
}

/**
 * Opaque user key for S3 paths — never raw email.
 */
export function buildUserKey(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required to build userKey')
  }
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16)
}

function formatTimestampForKey(isoDate) {
  const d = isoDate ? new Date(isoDate) : new Date()
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const yyyy = d.getUTCFullYear()
  const mm = pad(d.getUTCMonth() + 1)
  const dd = pad(d.getUTCDate())
  const hh = pad(d.getUTCHours())
  const min = pad(d.getUTCMinutes())
  const ss = pad(d.getUTCSeconds())
  const ms = pad(d.getUTCMilliseconds(), 3)
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}.${ms}Z`
}

/**
 * S3 key: workflow-runs/{userKey}/{YYYY}/{MM}/{DD}/{timestamp}-{runId}.json
 */
export function buildHistoryKey({ userKey, runId, completedAt }) {
  const d = completedAt ? new Date(completedAt) : new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const timestamp = formatTimestampForKey(completedAt)
  return `workflow-runs/${userKey}/${yyyy}/${mm}/${dd}/${timestamp}-${runId}.json`
}

/**
 * Deterministic sidecar key. Ownership remains authoritative in workflow
 * storage and must be verified before this object is read by an API route.
 */
export function buildAiRunFailureKey(runId) {
  return `${RUN_FAILURE_PREFIX}/${encodeURIComponent(normalizeRunId(runId))}.json`
}

/**
 * Persist only the small public AiRunFailureV1 contract. A process-local copy
 * keeps local development usable when S3 is absent or temporarily unavailable.
 */
export async function persistAiRunFailure(runId, failure) {
  const normalizedRunId = normalizeRunId(runId)
  const safeFailure = buildAiRunFailure(failure)
  const failureKey = buildAiRunFailureKey(normalizedRunId)
  localRunFailures.set(normalizedRunId, safeFailure)

  const bucket = getBucket()
  if (!bucket) return failureKey

  try {
    await getRunHistoryS3Client()
      .putObject({
        Bucket: bucket,
        Key: failureKey,
        Body: JSON.stringify(safeFailure),
        ContentType: 'application/json',
      })
      .promise()
  } catch (error) {
    warnFailureFallback('persist', error)
  }

  return failureKey
}

/**
 * Read a structured failure after the caller has verified run ownership.
 * Invalid or unavailable sidecars never expose their raw stored contents.
 */
export async function readAiRunFailure(runId) {
  const normalizedRunId = normalizeRunId(runId)
  const localFailure = localRunFailures.get(normalizedRunId) || null
  const bucket = getBucket()
  if (!bucket) return localFailure

  try {
    const response = await getRunHistoryS3Client()
      .getObject({ Bucket: bucket, Key: buildAiRunFailureKey(normalizedRunId) })
      .promise()
    const stored = JSON.parse(response.Body.toString())
    const failure = parseAiRunFailure(stored)
    if (!failure) return localFailure
    localRunFailures.set(normalizedRunId, failure)
    return failure
  } catch (error) {
    if (!isNotFoundError(error)) warnFailureFallback('read', error)
    return localFailure
  }
}

/**
 * Persist sparse AiRunHistoryRecord to S3. No-op when bucket is not configured.
 * Soft-fails on write errors so workflow terminal status is never rewritten.
 */
export async function persistRunHistory(record) {
  const bucket = getBucket()
  if (!bucket) {
    console.warn('run-history-store: S3_ARTICLES_BUCKET_NAME not set; skipping persist')
    return null
  }

  if (!record?.runId || !record?.userKey) {
    console.warn('run-history-store: missing runId or userKey; skipping persist')
    return null
  }

  const completedAt = record.completedAt || new Date().toISOString()
  const historyKey = buildHistoryKey({
    userKey: record.userKey,
    runId: record.runId,
    completedAt,
  })

  const body = { ...record, historyKey, completedAt }

  try {
    const s3 = getRunHistoryS3Client()
    await s3
      .putObject({
        Bucket: bucket,
        Key: historyKey,
        Body: JSON.stringify(body, null, 2),
        ContentType: 'application/json',
      })
      .promise()
    return historyKey
  } catch (error) {
    console.error('run-history-store: failed to persist history', error)
    return null
  }
}
