import crypto from 'crypto'
import AWS from 'aws-sdk'

let s3Client = null

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
