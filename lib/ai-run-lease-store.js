import crypto from 'crypto'
import AWS from 'aws-sdk'
import { buildUserKey } from './run-history-store'

const RESERVATION_LEASE_MS = 60_000
const ACTIVE_LEASE_MS = 10 * 60_000
const MAX_CAS_ATTEMPTS = 5
const LEASE_SCHEMA_VERSION = 1
const RETURN_TO_S3 = Symbol('return-to-s3')

const ACTIVE_STATUSES = new Set(['pending', 'running'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let s3Client = null
const localLeases = new Map()
const localQueues = new Map()

function getLeaseS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

function getBucket() {
  return process.env.S3_ARTICLES_BUCKET_NAME
}

function buildLeaseKey(userKey) {
  return `workflow-run-leases/${userKey}.json`
}

function normalizeStatus(status) {
  return status === 'canceled' ? 'cancelled' : String(status || '').toLowerCase()
}

function expiresAt(durationMs, now = Date.now()) {
  return new Date(now + durationMs).toISOString()
}

function isFuture(value, now = Date.now()) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) && timestamp > now
}

function hashRequestToken(requestToken) {
  return crypto.createHash('sha256').update(requestToken).digest('hex')
}

export function validateAiRunToken(requestToken) {
  return typeof requestToken === 'string' && UUID_V4_PATTERN.test(requestToken.trim())
}

function assertRequestToken(requestToken) {
  if (!validateAiRunToken(requestToken)) {
    const error = new Error('X-AI-Run-Token debe ser un UUID v4 válido')
    error.code = 'INVALID_RUN_TOKEN'
    throw error
  }
  return requestToken.trim().toLowerCase()
}

function assertUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('userId is required')
  }
  return buildUserKey(userId)
}

function assertMode(mode) {
  if (mode !== 'generate' && mode !== 'validate') {
    throw new TypeError('mode must be generate or validate')
  }
  return mode
}

function assertCoordination(coordination) {
  if (coordination !== 's3' && coordination !== 'local') {
    throw new TypeError('coordination must be s3 or local')
  }
  return coordination
}

function activeRunError(record, coordination) {
  const error = new Error('Ya existe un run de AI activo para esta cuenta')
  error.code = 'AI_RUN_ACTIVE'
  error.mode = record.mode
  error.activeMode = record.mode
  error.status = record.status === 'reserved' ? 'starting' : normalizeStatus(record.status)
  error.coordination = coordination
  return error
}

function claimLostError() {
  const error = new Error('La reserva del run ya no está vigente')
  error.code = 'AI_RUN_CLAIM_LOST'
  return error
}

function coordinationBusyError() {
  const error = new Error('No se pudo coordinar el run después de varios reintentos')
  error.code = 'AI_RUN_COORDINATION_BUSY'
  return error
}

function coordinationUnavailableError() {
  const error = new Error('No se pudo verificar el estado del run activo')
  error.code = 'AI_RUN_COORDINATION_UNAVAILABLE'
  return error
}

function isNotFoundError(error) {
  return error?.code === 'NoSuchKey' || error?.code === 'NotFound' || error?.statusCode === 404
}

function isPreconditionError(error) {
  return (
    error?.code === 'PreconditionFailed' ||
    error?.code === 'ConditionalRequestConflict' ||
    error?.statusCode === 412 ||
    error?.statusCode === 409
  )
}

function isDomainError(error) {
  return (
    error?.code === 'AI_RUN_ACTIVE' ||
    error?.code === 'AI_RUN_CLAIM_LOST' ||
    error?.code === 'AI_RUN_COORDINATION_BUSY' ||
    error?.code === 'AI_RUN_COORDINATION_UNAVAILABLE' ||
    error?.code === 'INVALID_RUN_TOKEN'
  )
}

async function readS3Lease(userKey) {
  try {
    const response = await getLeaseS3Client()
      .getObject({ Bucket: getBucket(), Key: buildLeaseKey(userKey) })
      .promise()
    const record = JSON.parse(response.Body.toString())
    localLeases.set(userKey, record)
    return { record, etag: response.ETag || null }
  } catch (error) {
    if (isNotFoundError(error)) return { record: null, etag: null }
    throw error
  }
}

async function writeS3Lease(userKey, record, etag) {
  const request = getLeaseS3Client().putObject({
    Bucket: getBucket(),
    Key: buildLeaseKey(userKey),
    Body: JSON.stringify(record),
    ContentType: 'application/json',
    ...(etag ? null : { IfNoneMatch: '*' }),
  })

  if (etag) {
    request.on('build', () => {
      request.httpRequest.headers['If-Match'] = etag
    })
  }

  await request.promise()
  localLeases.set(userKey, record)
}

async function withLocalLock(userKey, operation) {
  const previous = localQueues.get(userKey) || Promise.resolve()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => gate)
  localQueues.set(userKey, queued)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (localQueues.get(userKey) === queued) localQueues.delete(userKey)
  }
}

async function runLocalMutation(userKey, decide) {
  return withLocalLock(userKey, async () => {
    const decision = await decide(localLeases.get(userKey) || null, 'local')
    if (decision.next) {
      localLeases.set(userKey, { ...decision.next, coordination: 'local' })
    }
    if (decision.error) throw decision.error
    return decision.result
  })
}

async function runS3Mutation(userKey, decide) {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const { record, etag } = await readS3Lease(userKey)
    const decision = await decide(record, 's3')
    if (!decision.next) {
      if (decision.error) throw decision.error
      return decision.result
    }

    const next = { ...decision.next, coordination: 's3' }
    try {
      await writeS3Lease(userKey, next, etag)
    } catch (error) {
      if (isPreconditionError(error)) continue
      throw error
    }

    if (decision.error) throw decision.error
    return decision.result
  }

  throw coordinationBusyError()
}

function warnLocalFallback(error) {
  console.warn(
    'ai-run-lease-store: S3 coordination unavailable; using process-local coordination',
    error?.code || error?.message || error
  )
}

async function mutateLease(userKey, coordination, decide) {
  if (coordination === 'local' || !getBucket()) {
    return runLocalMutation(userKey, decide)
  }

  try {
    return await runS3Mutation(userKey, decide)
  } catch (error) {
    if (isDomainError(error)) throw error
    warnLocalFallback(error)
    return runLocalMutation(userKey, decide)
  }
}

async function readLease(userKey, coordination) {
  if (coordination === 'local' || !getBucket()) {
    return { record: localLeases.get(userKey) || null, coordination: 'local' }
  }

  try {
    const { record } = await readS3Lease(userKey)
    return { record, coordination: 's3' }
  } catch (error) {
    warnLocalFallback(error)
    return { record: localLeases.get(userKey) || null, coordination: 'local' }
  }
}

async function inspectExactRunStatus(runId) {
  try {
    // Keep workflow/api out of the module graph loaded by workflow schema tests.
    // Runtime inspection is only needed when replacing an existing active lease.
    const { getRun } = await import('workflow/api')
    const run = getRun(runId)
    if (!(await run.exists)) return 'missing'
    return normalizeStatus(await run.status)
  } catch {
    return null
  }
}

function publicLease(record, coordination, { reused = false } = {}) {
  return {
    claimId: record.claimId,
    runId: record.runId || null,
    mode: record.mode,
    status: record.status === 'reserved' ? 'starting' : record.status,
    coordination,
    reused,
  }
}

function makeReservation({ userKey, mode, claimId, requestTokenHash, coordination, now }) {
  const timestamp = new Date(now).toISOString()
  return {
    schemaVersion: LEASE_SCHEMA_VERSION,
    userKey,
    mode,
    claimId,
    requestTokenHash,
    runId: null,
    status: 'reserved',
    coordination,
    reservationExpiresAt: expiresAt(RESERVATION_LEASE_MS, now),
    leaseExpiresAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    releasedAt: null,
  }
}

function terminalRecord(record, status, coordination, now) {
  const timestamp = new Date(now).toISOString()
  return {
    ...record,
    status,
    coordination,
    reservationExpiresAt: null,
    leaseExpiresAt: timestamp,
    updatedAt: timestamp,
    releasedAt: timestamp,
  }
}

function preferredCoordination(userKey) {
  const local = localLeases.get(userKey)
  const localStatus = normalizeStatus(local?.status)
  const hasLocalAuthority =
    local?.coordination === 'local' &&
    ((localStatus === 'reserved' && isFuture(local.reservationExpiresAt)) ||
      (local?.runId && !TERMINAL_STATUSES.has(localStatus)))

  return hasLocalAuthority || !getBucket() ? 'local' : 's3'
}

export async function reserveAiRun({ userId, mode, requestToken }) {
  const userKey = assertUserId(userId)
  assertMode(mode)
  const token = assertRequestToken(requestToken)
  const requestTokenHash = hashRequestToken(token)
  const claimId = crypto.randomUUID()
  let canReturnToS3 = true

  const decide = async (stored, coordination) => {
    const now = Date.now()
    let current = stored

    if (current?.requestTokenHash === requestTokenHash) {
      if (current.runId || TERMINAL_STATUSES.has(normalizeStatus(current.status))) {
        return { result: publicLease(current, coordination, { reused: true }) }
      }
      if (current.status === 'reserved' && isFuture(current.reservationExpiresAt, now)) {
        return { result: publicLease(current, coordination, { reused: true }) }
      }
    }

    if (current?.status === 'reserved' && isFuture(current.reservationExpiresAt, now)) {
      return { error: activeRunError(current, coordination) }
    }

    if (current?.runId && !TERMINAL_STATUSES.has(normalizeStatus(current.status))) {
      const exactStatus = await inspectExactRunStatus(current.runId)

      if (TERMINAL_STATUSES.has(exactStatus)) {
        current = terminalRecord(current, exactStatus, coordination, now)
        if (current.requestTokenHash === requestTokenHash) {
          return {
            next: current,
            result: publicLease(current, coordination, { reused: true }),
          }
        }
      } else if (ACTIVE_STATUSES.has(exactStatus)) {
        const renewed = {
          ...current,
          status: exactStatus,
          coordination,
          leaseExpiresAt: expiresAt(ACTIVE_LEASE_MS, now),
          updatedAt: new Date(now).toISOString(),
        }
        return { next: renewed, error: activeRunError(renewed, coordination) }
      } else if (isFuture(current.leaseExpiresAt, now)) {
        return { error: activeRunError(current, coordination) }
      } else if (
        exactStatus === null ||
        (exactStatus !== 'missing' && !TERMINAL_STATUSES.has(exactStatus))
      ) {
        return { error: coordinationUnavailableError() }
      }
    }

    if (canReturnToS3 && coordination === 'local' && getBucket()) {
      return { next: current, result: RETURN_TO_S3 }
    }

    const reservation = makeReservation({
      userKey,
      mode,
      claimId,
      requestTokenHash,
      coordination,
      now,
    })
    return { next: reservation, result: publicLease(reservation, coordination) }
  }

  const result = await mutateLease(userKey, preferredCoordination(userKey), decide)
  if (result !== RETURN_TO_S3) return result

  canReturnToS3 = false
  return mutateLease(userKey, 's3', decide)
}

export async function activateAiRunLease({
  userId,
  mode,
  requestToken,
  claimId,
  runId,
  coordination,
}) {
  const userKey = assertUserId(userId)
  assertMode(mode)
  const tokenHash = hashRequestToken(assertRequestToken(requestToken))
  assertCoordination(coordination)

  if (!claimId || !runId) throw claimLostError()

  return mutateLease(userKey, coordination, async (current, actualCoordination) => {
    if (
      !current ||
      current.claimId !== claimId ||
      current.mode !== mode ||
      current.requestTokenHash !== tokenHash ||
      (current.runId && current.runId !== runId) ||
      current.status === 'released'
    ) {
      return { error: claimLostError() }
    }

    if (current.runId === runId && TERMINAL_STATUSES.has(normalizeStatus(current.status))) {
      return { result: publicLease(current, actualCoordination, { reused: true }) }
    }

    const now = Date.now()
    const next = {
      ...current,
      runId,
      status: ACTIVE_STATUSES.has(normalizeStatus(current.status)) ? current.status : 'pending',
      coordination: actualCoordination,
      reservationExpiresAt: null,
      leaseExpiresAt: expiresAt(ACTIVE_LEASE_MS, now),
      updatedAt: new Date(now).toISOString(),
    }
    return {
      next,
      result: publicLease(next, actualCoordination, { reused: Boolean(current.runId) }),
    }
  })
}

export async function confirmAiRunClaim({ userId, mode, claimId, runId, coordination }) {
  const userKey = assertUserId(userId)
  assertMode(mode)
  assertCoordination(coordination)

  if (!claimId || !runId) throw claimLostError()

  return mutateLease(userKey, coordination, async (current, actualCoordination) => {
    // A workflow step may execute in a different worker from the route that
    // created a process-local reservation. In degraded mode there is no shared
    // authority to consult, so absence is accepted; a known mismatched claim is
    // still rejected within the process that owns it.
    if (!current && actualCoordination === 'local') {
      return { result: { ok: true, coordination: 'local' } }
    }

    if (
      !current ||
      current.claimId !== claimId ||
      current.mode !== mode ||
      (current.runId && current.runId !== runId) ||
      current.status === 'released'
    ) {
      return { error: claimLostError() }
    }

    if (TERMINAL_STATUSES.has(normalizeStatus(current.status))) {
      return { result: { ok: true, coordination: actualCoordination } }
    }

    const now = Date.now()
    const next = {
      ...current,
      runId,
      status: ACTIVE_STATUSES.has(normalizeStatus(current.status)) ? current.status : 'pending',
      coordination: actualCoordination,
      reservationExpiresAt: null,
      leaseExpiresAt: expiresAt(ACTIVE_LEASE_MS, now),
      updatedAt: new Date(now).toISOString(),
    }
    return { next, result: { ok: true, coordination: actualCoordination } }
  })
}

export async function releaseAiRunReservation({ userId, claimId, coordination }) {
  const userKey = assertUserId(userId)
  assertCoordination(coordination)
  if (!claimId) throw claimLostError()

  return mutateLease(userKey, coordination, async (current, actualCoordination) => {
    if (!current || current.claimId !== claimId) return { error: claimLostError() }
    if (current.runId) return { result: false }
    if (current.status === 'released') return { result: true }

    const now = Date.now()
    const next = terminalRecord(current, 'released', actualCoordination, now)
    return { next, result: true }
  })
}

function recoverableLease(record, coordination) {
  if (!record || record.status === 'released') return null
  if (record.status === 'reserved') {
    if (!isFuture(record.reservationExpiresAt)) return null
    return {
      runId: null,
      status: 'starting',
      mode: record.mode,
      coordination,
    }
  }
  if (!record.runId) return null
  return {
    runId: record.runId,
    status: normalizeStatus(record.status),
    mode: record.mode,
    coordination,
  }
}

export async function recoverAiRun({ userId, requestToken }) {
  const userKey = assertUserId(userId)
  const requestTokenHash = hashRequestToken(assertRequestToken(requestToken))
  const preferred = preferredCoordination(userKey)
  const snapshot = await readLease(userKey, preferred)

  if (snapshot.record?.requestTokenHash === requestTokenHash) {
    return recoverableLease(snapshot.record, snapshot.coordination)
  }

  // A request may have degraded locally after an earlier successful S3 reservation.
  const local = localLeases.get(userKey)
  if (local?.coordination === 'local' && local.requestTokenHash === requestTokenHash) {
    return recoverableLease(local, 'local')
  }
  return null
}

export async function syncAiRunLeaseFromStatus({ userId, runId, status }) {
  const userKey = assertUserId(userId)
  const normalizedStatus = normalizeStatus(status)
  if (!runId || !normalizedStatus) return null
  const preferred = preferredCoordination(userKey)

  return mutateLease(userKey, preferred, async (current, coordination) => {
    // Polling an older run must never release or renew a newer claim.
    if (!current || current.runId !== runId) return { result: null }

    const now = Date.now()
    const next = TERMINAL_STATUSES.has(normalizedStatus)
      ? terminalRecord(current, normalizedStatus, coordination, now)
      : {
          ...current,
          status: normalizedStatus,
          coordination,
          reservationExpiresAt: null,
          leaseExpiresAt: expiresAt(ACTIVE_LEASE_MS, now),
          updatedAt: new Date(now).toISOString(),
          releasedAt: null,
        }

    return {
      next,
      result: {
        runId,
        status: normalizedStatus,
        mode: current.mode,
        coordination,
      },
    }
  })
}

export function __resetAiRunLeaseStoreForTests() {
  s3Client = null
  localLeases.clear()
  localQueues.clear()
}
