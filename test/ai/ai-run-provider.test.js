import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AI_RUN_MODES,
  AI_RUN_POLL_TIMEOUT_MS,
  AI_RUN_STORAGE_VERSION,
  AiRunProvider,
  buildAiRunStorageKey,
  normalizeAiRunFailure,
  serializeAiRunPointer,
  useAiRunCoordinator,
} from '../../lib/hooks/AiRunProvider'

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
  }
}

function pointer(overrides = {}) {
  return {
    hydrated: true,
    mode: AI_RUN_MODES.GENERATE,
    requestToken: 'fdce5d4f-43db-4d9f-8f3c-b709985ad40f',
    runId: null,
    status: 'starting',
    coordination: 's3',
    createdAt: '2026-08-07T12:00:00.000Z',
    updatedAt: '2026-08-07T12:00:00.000Z',
    ...overrides,
  }
}

describe('AiRunProvider', () => {
  let container
  let root
  let current
  const userKey = 'a'.repeat(64)
  const storageKey = buildAiRunStorageKey(userKey)

  function Probe() {
    const value = useAiRunCoordinator()
    React.useEffect(() => {
      current = value
    }, [value])
    return null
  }

  function render(showProbe = true) {
    root.render(<AiRunProvider userKey={userKey}>{showProbe ? <Probe /> : null}</AiRunProvider>)
  }

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(async () => {
    jest.useFakeTimers()
    window.localStorage.clear()
    global.fetch = jest.fn()
    current = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('keeps POST and polling alive when the AI consumer unmounts', async () => {
    let finishPoll
    const pollResponse = new Promise((resolve) => {
      finishPoll = resolve
    })
    fetch
      .mockResolvedValueOnce(
        response(202, {
          runId: 'run-generation-1',
          mode: 'generate',
          status: 'pending',
          coordination: 's3',
        })
      )
      .mockReturnValueOnce(pollResponse)

    await act(async () => render())
    await act(async () => {
      await current.startRun({
        mode: AI_RUN_MODES.GENERATE,
        url: '/api/admin/ai/generate',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'dato que nunca debe persistirse' }),
      })
    })

    const startOptions = fetch.mock.calls[0][1]
    expect(startOptions.headers.get('X-AI-Run-Token')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )

    await act(async () => render(false))
    await act(async () => {
      finishPoll(
        response(200, {
          runId: 'run-generation-1',
          status: 'completed',
          result: {
            result: { drafts: [{ caption: 'resultado privado' }] },
            usage: { totalTokens: 12 },
          },
        })
      )
      await Promise.resolve()
    })
    await act(async () => render())

    expect(current.slot.status).toBe('completed')
    expect(current.slot.payload.result.drafts[0].caption).toBe('resultado privado')
    const stored = window.localStorage.getItem(storageKey)
    expect(stored).toContain('run-generation-1')
    expect(stored).not.toContain('dato que nunca debe persistirse')
    expect(stored).not.toContain('resultado privado')
    expect(Object.keys(JSON.parse(stored))).toEqual([
      'version',
      'mode',
      'requestToken',
      'runId',
      'status',
      'coordination',
      'createdAt',
      'updatedAt',
    ])
  })

  test('retains a safe structured failure without persisting it or exposing the run id', async () => {
    const draftSession = {}
    fetch
      .mockResolvedValueOnce(
        response(202, {
          runId: 'wrun_private_failure',
          mode: 'generate',
          status: 'pending',
        })
      )
      .mockResolvedValueOnce(
        response(200, {
          runId: 'wrun_private_failure',
          status: 'failed',
          error:
            'Workflow run "wrun_private_failure" failed: La revisión de política no pudo completarse.',
          failure: {
            schemaVersion: 1,
            code: 'policy_classification_unavailable',
            stage: 'request',
            retryable: true,
            message: 'policy_classification_unavailable',
            runId: 'wrun_private_failure',
          },
        })
      )

    await act(async () => render())
    await act(async () => {
      await current.startRun({
        mode: AI_RUN_MODES.GENERATE,
        url: '/api/admin/ai/generate',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'contenido privado del formulario' }),
        draftSession,
      })
      await Promise.resolve()
    })
    await act(async () => Promise.resolve())

    expect(current.slot.status).toBe('failed')
    expect(current.slot.sessionStarted).toBe(true)
    expect(current.slot.draftSession).toBe(draftSession)
    expect(JSON.parse(current.slot.retryRequest.body)).toEqual({
      topic: 'contenido privado del formulario',
    })
    expect(current.slot.error).toBe(
      'La revisión de política no pudo completarse. No se confirmó una infracción del contenido; intenta nuevamente.'
    )
    expect(current.slot.failure).toEqual({
      schemaVersion: 1,
      code: 'policy_classification_unavailable',
      stage: 'request',
      retryable: true,
      message:
        'La revisión de política no pudo completarse. No se confirmó una infracción del contenido; intenta nuevamente.',
    })
    expect(current.slot.failure).not.toHaveProperty('runId')

    const stored = window.localStorage.getItem(storageKey)
    expect(stored).not.toContain('contenido privado')
    expect(stored).not.toContain('policy_classification')
    expect(stored).not.toContain('"stage":"request"')
    expect(stored).not.toContain('"failure"')
    expect(stored).not.toContain('"retryRequest"')
    expect(JSON.parse(stored)).toMatchObject({
      runId: 'wrun_private_failure',
      status: 'failed',
    })

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey,
          newValue: JSON.stringify({ ...JSON.parse(stored), requestToken: null }),
        })
      )
    })
    expect(current.slot.sessionStarted).toBe(true)
    expect(current.slot.requestToken).not.toBeNull()
    expect(current.slot.draftSession).toBe(draftSession)
    expect(JSON.parse(current.slot.retryRequest.body)).toEqual({
      topic: 'contenido privado del formulario',
    })
    expect(current.slot.failure.retryable).toBe(true)
  })

  test('stops indefinite polling with a recoverable client timeout', async () => {
    fetch
      .mockResolvedValueOnce(
        response(202, {
          runId: 'wrun_slow_generation',
          mode: 'generate',
          status: 'pending',
        })
      )
      .mockResolvedValue(
        response(200, {
          runId: 'wrun_slow_generation',
          status: 'pending',
        })
      )

    await act(async () => render())
    await act(async () => {
      await current.startRun({
        mode: AI_RUN_MODES.GENERATE,
        url: '/api/admin/ai/generate',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      await Promise.resolve()
    })

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AI_RUN_POLL_TIMEOUT_MS)
    })

    expect(current.slot.status).toBe('timeout')
    expect(current.slot.failure).toMatchObject({
      code: 'run_poll_timeout',
      stage: 'status',
      retryable: true,
    })
    expect(current.slot.error).toContain('tiempo máximo de espera')
  })

  test('normalizes a legacy workflow wrapper to a friendly error string', () => {
    expect(
      normalizeAiRunFailure(
        'Workflow run "wrun_01KZPQ2JPVF78SRYBE3YEEY7QS" failed: No se pudo completar la generación.'
      )
    ).toEqual({
      message: 'No se pudo completar la generación.',
      retryable: false,
    })
  })

  test('preserves a specific sanitized explanation instead of replacing it by code', () => {
    expect(
      normalizeAiRunFailure({
        schemaVersion: 1,
        code: 'required_image_unavailable',
        stage: 'image_preparation',
        retryable: false,
        message:
          'El proveedor generó un archivo, pero no pudo convertirse en una imagen segura para mostrar.',
      })
    ).toMatchObject({
      code: 'required_image_unavailable',
      stage: 'image_preparation',
      retryable: false,
      message:
        'El proveedor generó un archivo, pero no pudo convertirse en una imagen segura para mostrar.',
    })
  })

  test('does not expose prose from an unversioned structured provider error', () => {
    expect(
      normalizeAiRunFailure(
        {
          code: 'provider_error',
          message: 'Upstream account secret and internal routing detail',
          retryable: true,
        },
        'El servicio no respondió.'
      )
    ).toMatchObject({
      code: 'provider_error',
      retryable: true,
      message: 'El servicio no respondió.',
    })
  })

  test('persists the starting marker before POST and records a late response after unmount', async () => {
    let finishStart
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finishStart = resolve
      })
    )

    await act(async () => render())
    let startPromise
    await act(async () => {
      startPromise = current.startRun({
        mode: AI_RUN_MODES.VALIDATE,
        url: '/api/admin/ai/validate',
        body: new FormData(),
      })
      expect(JSON.parse(window.localStorage.getItem(storageKey))).toMatchObject({
        mode: 'validate',
        status: 'starting',
        runId: null,
      })
    })

    await act(async () => root.unmount())
    finishStart(
      response(202, {
        runId: 'run-late-response',
        mode: 'validate',
        status: 'pending',
        coordination: 's3',
      })
    )
    await startPromise

    expect(JSON.parse(window.localStorage.getItem(storageKey))).toMatchObject({
      runId: 'run-late-response',
      mode: 'validate',
      status: 'pending',
    })

    // The test already unmounted the provider.
    root = createRoot(container)
  })

  test('recovers a starting marker and never expires it after repeated 404s', async () => {
    window.localStorage.setItem(storageKey, serializeAiRunPointer(pointer()))
    fetch.mockResolvedValue(response(404, { error: 'No encontrado' }))

    await act(async () => render())
    await act(async () => {
      jest.advanceTimersByTime(750)
      await Promise.resolve()
    })
    await act(async () => {
      jest.advanceTimersByTime(22000)
      await Promise.resolve()
    })

    expect(fetch.mock.calls.every(([url]) => url === '/api/admin/ai/runs/recover')).toBe(true)
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      requestToken: 'fdce5d4f-43db-4d9f-8f3c-b709985ad40f',
    })
    expect(current.slot.status).toBe('starting')
    expect(window.localStorage.getItem(storageKey)).not.toBeNull()
  })

  test('requires two confirmed URL 404s and preserves the existing pointer', async () => {
    window.localStorage.setItem(
      storageKey,
      serializeAiRunPointer(pointer({ runId: 'saved-run', status: 'pending', requestToken: null }))
    )
    fetch.mockImplementation((url) =>
      url.endsWith('/saved-run')
        ? Promise.resolve(response(200, { runId: 'saved-run', status: 'pending' }))
        : Promise.resolve(response(404, { error: 'No encontrado' }))
    )
    await act(async () => render())

    let first
    let second
    await act(async () => {
      first = await current.adoptUrlRun(AI_RUN_MODES.VALIDATE, 'url-run')
      second = await current.adoptUrlRun(AI_RUN_MODES.VALIDATE, 'url-run')
    })

    expect(first.status).toBe('retry')
    expect(second.status).toBe('not-found')
    expect(current.slot.runId).toBe('saved-run')
    expect(current.slot.mode).toBe(AI_RUN_MODES.GENERATE)
  })

  test('adopts and clears pointers written by another tab', async () => {
    fetch.mockResolvedValue(
      response(200, {
        runId: 'cross-tab-run',
        status: 'completed',
        result: { overallOutcome: 'approved' },
      })
    )
    await act(async () => render())

    const incoming = serializeAiRunPointer(
      pointer({
        mode: AI_RUN_MODES.VALIDATE,
        runId: 'cross-tab-run',
        status: 'completed',
      })
    )
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: incoming }))
      await Promise.resolve()
    })

    expect(current.slot.mode).toBe(AI_RUN_MODES.VALIDATE)
    expect(current.slot.payload).toEqual({ overallOutcome: 'approved' })

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: null }))
    })
    expect(current.slot.status).toBe('idle')
    expect(current.slot.payload).toBeNull()
  })

  test('does not let a competing starting marker hide its in-flight POST response', async () => {
    let finishPost
    const postResponse = new Promise((resolve) => {
      finishPost = resolve
    })
    fetch
      .mockReturnValueOnce(postResponse)
      .mockResolvedValueOnce(response(200, { runId: 'winning-run', status: 'running' }))
    await act(async () => render())

    let pendingStart
    await act(async () => {
      pendingStart = current.startRun({
        mode: AI_RUN_MODES.GENERATE,
        url: '/api/admin/ai/generate',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      await Promise.resolve()
    })
    const ownToken = current.slot.requestToken

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey,
          newValue: serializeAiRunPointer(
            pointer({ requestToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
          ),
        })
      )
    })
    expect(current.slot.requestToken).toBe(ownToken)

    await act(async () => {
      finishPost(
        response(202, {
          runId: 'winning-run',
          mode: 'generate',
          status: 'pending',
          coordination: 's3',
        })
      )
      await pendingStart
      await Promise.resolve()
    })
    expect(current.slot.runId).toBe('winning-run')
  })

  test('rejects unversioned or data-bearing local pointers', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: AI_RUN_STORAGE_VERSION + 1,
        mode: 'generate',
        status: 'completed',
        runId: 'old-run',
        result: { secret: true },
      })
    )
    await act(async () => render())

    expect(current.slot.status).toBe('idle')
    expect(window.localStorage.getItem(storageKey)).toBeNull()
  })
})
