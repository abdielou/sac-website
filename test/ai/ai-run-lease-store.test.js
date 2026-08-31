/**
 * @jest-environment node
 */

const mockGetObject = jest.fn()
const mockPutObject = jest.fn()
const mockGetRun = jest.fn()

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getObject: mockGetObject,
    putObject: mockPutObject,
  })),
}))

jest.mock('workflow/api', () => ({ getRun: mockGetRun }))

import { buildUserKey } from '../../lib/run-history-store'
import {
  __resetAiRunLeaseStoreForTests,
  activateAiRunLease,
  confirmAiRunClaim,
  recoverAiRun,
  releaseAiRunReservation,
  reserveAiRun,
  syncAiRunLeaseFromStatus,
  validateAiRunToken,
} from '../../lib/ai-run-lease-store'

const USER_ID = 'member@example.com'
const TOKEN_A = '3f60494e-d1b8-4b12-bde5-f327df94c538'
const TOKEN_B = 'fa09175a-b7ab-40b0-a6a4-914fca1eb5f2'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function etagFor(value) {
  return `"${Buffer.from(JSON.stringify(value)).toString('base64')}"`
}

function notFoundRequest() {
  const error = Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey', statusCode: 404 })
  return { promise: () => Promise.reject(error) }
}

function preconditionError() {
  return Object.assign(new Error('PreconditionFailed'), {
    code: 'PreconditionFailed',
    statusCode: 412,
  })
}

function conditionalConflictRequest() {
  const error = Object.assign(new Error('ConditionalRequestConflict'), {
    code: 'ConditionalRequestConflict',
    statusCode: 409,
  })
  const request = {
    httpRequest: { headers: {} },
    on: jest.fn(() => request),
    promise: () => Promise.reject(error),
  }
  return request
}

describe('ai-run-lease-store', () => {
  let objects
  let writes

  beforeEach(() => {
    objects = new Map()
    writes = []
    process.env.S3_ARTICLES_BUCKET_NAME = 'test-bucket'
    process.env.AWS_REGION = 'us-east-1'
    __resetAiRunLeaseStoreForTests()

    mockGetObject.mockImplementation(({ Key }) => {
      if (!objects.has(Key)) return notFoundRequest()
      const value = clone(objects.get(Key))
      return {
        promise: () =>
          Promise.resolve({ Body: Buffer.from(JSON.stringify(value)), ETag: etagFor(value) }),
      }
    })

    mockPutObject.mockImplementation(({ Key, Body, IfNoneMatch }) => {
      const buildListeners = []
      const request = {
        httpRequest: { headers: {} },
        on: jest.fn((event, listener) => {
          if (event === 'build') buildListeners.push(listener)
          return request
        }),
        promise: async () => {
          buildListeners.forEach((listener) => listener())
          const ifMatch = request.httpRequest.headers['If-Match'] || null
          writes.push({ Key, ifMatch, ifNoneMatch: IfNoneMatch || null })
          if (IfNoneMatch === '*' && objects.has(Key)) throw preconditionError()
          if (ifMatch && (!objects.has(Key) || ifMatch !== etagFor(objects.get(Key)))) {
            throw preconditionError()
          }
          objects.set(Key, JSON.parse(Body))
          return {}
        },
      }
      return request
    })

    mockGetRun.mockImplementation(() => ({
      exists: Promise.resolve(true),
      status: Promise.resolve('running'),
    }))
  })

  afterEach(() => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  test('validates UUID v4 request tokens', async () => {
    expect(validateAiRunToken(TOKEN_A)).toBe(true)
    expect(validateAiRunToken('not-a-token')).toBe(false)
    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'generate', requestToken: 'not-a-token' })
    ).rejects.toMatchObject({ code: 'INVALID_RUN_TOKEN' })
  })

  test('creates an opaque create-only S3 reservation without PII or raw token', async () => {
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })

    expect(reservation).toMatchObject({
      runId: null,
      mode: 'generate',
      status: 'starting',
      coordination: 's3',
      reused: false,
    })
    const key = `workflow-run-leases/${buildUserKey(USER_ID)}.json`
    expect(objects.has(key)).toBe(true)
    expect(writes[0]).toEqual({ Key: key, ifMatch: null, ifNoneMatch: '*' })
    expect(JSON.stringify(objects.get(key))).not.toContain(USER_ID)
    expect(JSON.stringify(objects.get(key))).not.toContain(TOKEN_A)
    expect(objects.get(key).requestTokenHash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('same token is idempotent through reservation, activation and recovery', async () => {
    const first = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    const duplicate = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    expect(duplicate).toMatchObject({ claimId: first.claimId, reused: true, status: 'starting' })

    const duplicateFromOtherRoute = await reserveAiRun({
      userId: USER_ID,
      mode: 'validate',
      requestToken: TOKEN_A,
    })
    expect(duplicateFromOtherRoute).toMatchObject({
      claimId: first.claimId,
      mode: 'generate',
      reused: true,
    })

    const active = await activateAiRunLease({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
      claimId: first.claimId,
      runId: 'wrun_one',
      coordination: first.coordination,
    })
    expect(active).toMatchObject({ runId: 'wrun_one', status: 'pending' })
    await expect(recoverAiRun({ userId: USER_ID, requestToken: TOKEN_A })).resolves.toEqual({
      runId: 'wrun_one',
      status: 'pending',
      mode: 'generate',
      coordination: 's3',
    })

    const afterActivation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    expect(afterActivation).toMatchObject({ runId: 'wrun_one', reused: true })
  })

  test('different generate/validate tokens race for one global slot', async () => {
    const settled = await Promise.allSettled([
      reserveAiRun({ userId: USER_ID, mode: 'generate', requestToken: TOKEN_A }),
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B }),
    ])
    const successes = settled.filter(({ status }) => status === 'fulfilled')
    const failures = settled.filter(({ status }) => status === 'rejected')

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0].reason).toMatchObject({ code: 'AI_RUN_ACTIVE' })
    expect(failures[0].reason.runId).toBeUndefined()
    expect(['generate', 'validate']).toContain(failures[0].reason.activeMode)
    expect(failures[0].reason.status).toBe('starting')
    expect(writes.filter(({ ifNoneMatch }) => ifNoneMatch === '*').length).toBeGreaterThanOrEqual(2)
  })

  test('retries an S3 409 conditional conflict without degrading to local coordination', async () => {
    mockPutObject.mockImplementationOnce(() => conditionalConflictRequest())

    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'generate', requestToken: TOKEN_A })
    ).resolves.toMatchObject({ coordination: 's3', reused: false })

    expect(mockGetObject).toHaveBeenCalledTimes(2)
    expect(mockPutObject).toHaveBeenCalledTimes(2)
  })

  test('claim confirmation may win the activation race and is idempotent', async () => {
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'validate',
      requestToken: TOKEN_A,
    })
    await expect(
      confirmAiRunClaim({
        userId: USER_ID,
        mode: 'validate',
        claimId: reservation.claimId,
        runId: 'wrun_validate',
        coordination: 's3',
      })
    ).resolves.toEqual({ ok: true, coordination: 's3' })

    await expect(
      confirmAiRunClaim({
        userId: USER_ID,
        mode: 'validate',
        claimId: reservation.claimId,
        runId: 'wrun_validate',
        coordination: 's3',
      })
    ).resolves.toEqual({ ok: true, coordination: 's3' })

    await expect(
      confirmAiRunClaim({
        userId: USER_ID,
        mode: 'validate',
        claimId: 'wrong-claim',
        runId: 'wrun_validate',
        coordination: 's3',
      })
    ).rejects.toMatchObject({ code: 'AI_RUN_CLAIM_LOST' })
  })

  test('exact getRun status keeps an expired active lease blocked', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T10:00:00.000Z'))
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    await activateAiRunLease({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
      claimId: reservation.claimId,
      runId: 'wrun_running',
      coordination: 's3',
    })
    jest.setSystemTime(new Date('2026-08-07T10:20:00.000Z'))

    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B })
    ).rejects.toMatchObject({ code: 'AI_RUN_ACTIVE', activeMode: 'generate' })
    expect(mockGetRun).toHaveBeenCalledWith('wrun_running')
  })

  test('fails closed when an expired active run cannot be inspected', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T10:00:00.000Z'))
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    await activateAiRunLease({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
      claimId: reservation.claimId,
      runId: 'wrun_unknown',
      coordination: 's3',
    })
    jest.setSystemTime(new Date('2026-08-07T10:20:00.000Z'))
    mockGetRun.mockImplementation(() => {
      throw new Error('Workflow unavailable')
    })

    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B })
    ).rejects.toMatchObject({ code: 'AI_RUN_COORDINATION_UNAVAILABLE' })
  })

  test('uses a fresh lease to block when run inspection is temporarily unavailable', async () => {
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    await activateAiRunLease({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
      claimId: reservation.claimId,
      runId: 'wrun_fresh_unknown',
      coordination: 's3',
    })
    mockGetRun.mockImplementation(() => {
      throw new Error('Workflow unavailable')
    })

    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B })
    ).rejects.toMatchObject({ code: 'AI_RUN_ACTIVE', status: 'pending' })
  })

  test('terminal exact status and terminal sync release the slot', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T10:00:00.000Z'))
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    await activateAiRunLease({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
      claimId: reservation.claimId,
      runId: 'wrun_done',
      coordination: 's3',
    })
    await syncAiRunLeaseFromStatus({ userId: USER_ID, runId: 'wrun_done', status: 'completed' })

    const next = await reserveAiRun({
      userId: USER_ID,
      mode: 'validate',
      requestToken: TOKEN_B,
    })
    expect(next).toMatchObject({ mode: 'validate', status: 'starting', reused: false })
  })

  test('an expired reservation is no longer recoverable and can be replaced', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T10:00:00.000Z'))
    await reserveAiRun({ userId: USER_ID, mode: 'generate', requestToken: TOKEN_A })
    jest.setSystemTime(new Date('2026-08-07T10:01:01.000Z'))

    await expect(recoverAiRun({ userId: USER_ID, requestToken: TOKEN_A })).resolves.toBeNull()
    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B })
    ).resolves.toMatchObject({ mode: 'validate', reused: false })
  })

  test('release only clears its own unactivated reservation', async () => {
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    await expect(
      releaseAiRunReservation({
        userId: USER_ID,
        claimId: reservation.claimId,
        coordination: 's3',
      })
    ).resolves.toBe(true)
    await expect(recoverAiRun({ userId: USER_ID, requestToken: TOKEN_A })).resolves.toBeNull()
  })

  test('falls back to process-local coordination when S3 is unavailable', async () => {
    mockGetObject.mockImplementation(() => ({
      promise: () =>
        Promise.reject(Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' })),
    }))
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    expect(reservation.coordination).toBe('local')

    // Even if S3 recovers, this process must keep honoring its active local slot.
    mockGetObject.mockImplementation(() => notFoundRequest())
    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B })
    ).rejects.toMatchObject({ code: 'AI_RUN_ACTIVE', coordination: 'local' })
    expect(warning).toHaveBeenCalled()
    warning.mockRestore()
  })

  test('returns to S3 after an active local run becomes terminal', async () => {
    mockGetObject.mockImplementation(() => ({
      promise: () =>
        Promise.reject(Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' })),
    }))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const local = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })
    await activateAiRunLease({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
      claimId: local.claimId,
      runId: 'wrun_local_done',
      coordination: 'local',
    })

    mockGetRun.mockImplementation(() => ({
      exists: Promise.resolve(true),
      status: Promise.resolve('completed'),
    }))
    mockGetObject.mockImplementation(({ Key }) => {
      if (!objects.has(Key)) return notFoundRequest()
      const value = clone(objects.get(Key))
      return {
        promise: () =>
          Promise.resolve({ Body: Buffer.from(JSON.stringify(value)), ETag: etagFor(value) }),
      }
    })

    await expect(
      reserveAiRun({ userId: USER_ID, mode: 'validate', requestToken: TOKEN_B })
    ).resolves.toMatchObject({ coordination: 's3', mode: 'validate' })
  })

  test('unconfigured S3 uses local coordination and starting recovery', async () => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'validate',
      requestToken: TOKEN_A,
    })
    expect(reservation.coordination).toBe('local')
    await expect(recoverAiRun({ userId: USER_ID, requestToken: TOKEN_A })).resolves.toEqual({
      runId: null,
      status: 'starting',
      mode: 'validate',
      coordination: 'local',
    })
  })

  test('a local claim can start in a workflow worker without the route process map', async () => {
    delete process.env.S3_ARTICLES_BUCKET_NAME
    const reservation = await reserveAiRun({
      userId: USER_ID,
      mode: 'generate',
      requestToken: TOKEN_A,
    })

    // Simulate the workflow step running in another process/isolate.
    __resetAiRunLeaseStoreForTests()

    await expect(
      confirmAiRunClaim({
        userId: USER_ID,
        mode: 'generate',
        claimId: reservation.claimId,
        runId: 'wrun_local_worker',
        coordination: 'local',
      })
    ).resolves.toEqual({ ok: true, coordination: 'local' })
  })

  test('an S3 claim degrades safely when the workflow worker cannot reach S3', async () => {
    mockGetObject.mockImplementation(() => ({
      promise: () =>
        Promise.reject(Object.assign(new Error('AccessDenied'), { code: 'AccessDenied' })),
    }))
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      confirmAiRunClaim({
        userId: USER_ID,
        mode: 'validate',
        claimId: 'claim-created-before-outage',
        runId: 'wrun_during_outage',
        coordination: 's3',
      })
    ).resolves.toEqual({ ok: true, coordination: 'local' })
  })
})
