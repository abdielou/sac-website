import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AI_RUN_STORAGE_VERSION,
  AiRunProvider,
  buildAiRunStorageKey,
} from '../../lib/hooks/AiRunProvider'
import { useAiGenerationRun } from '../../lib/hooks/useAiGenerationRun'
import { useAiValidationRun } from '../../lib/hooks/useAiValidationRun'
import { DEFAULT_GENERATION_FORM } from '../../lib/social-template/buildGenerationPayload'

let mockSearch = ''
const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
  }
}

describe('recoverable AI run hooks', () => {
  let container
  let root
  let current
  const userKey = 'b'.repeat(64)
  const storageKey = buildAiRunStorageKey(userKey)

  function Capture({ value }) {
    React.useEffect(() => {
      current = value
    }, [value])
    return null
  }

  function GenerationProbe() {
    const value = useAiGenerationRun({ canGenerate: true })
    return <Capture value={value} />
  }

  function ValidationProbe() {
    const value = useAiValidationRun({ canValidate: true })
    return <Capture value={value} />
  }

  function render(mode) {
    root.render(
      <AiRunProvider userKey={userKey}>
        {mode === 'generate' ? <GenerationProbe /> : <ValidationProbe />}
      </AiRunProvider>
    )
  }

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    jest.useFakeTimers()
    mockSearch = ''
    mockReplace.mockReset()
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

  test('restores a persisted result URL and rehydrates the result from the server', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: AI_RUN_STORAGE_VERSION,
        mode: 'validate',
        requestToken: null,
        runId: 'saved-validation',
        status: 'completed',
        coordination: 's3',
        createdAt: '2026-08-07T12:00:00.000Z',
        updatedAt: '2026-08-07T12:01:00.000Z',
      })
    )
    fetch.mockResolvedValue(
      response(200, {
        runId: 'saved-validation',
        status: 'completed',
        result: { result: { overallOutcome: 'approved' }, usage: { totalTokens: 7 } },
      })
    )

    await act(async () => {
      render('validate')
      await Promise.resolve()
    })

    expect(mockReplace).toHaveBeenCalledWith('/admin/ai?runId=saved-validation', {
      scroll: false,
    })
    expect(current.phase).toBe('completed')
    expect(current.result).toEqual({ overallOutcome: 'approved' })
    expect(current.usage).toEqual({ totalTokens: 7 })
  })

  test('blocks the other form while the global slot is active', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: AI_RUN_STORAGE_VERSION,
        mode: 'generate',
        requestToken: null,
        runId: 'active-generation',
        status: 'running',
        coordination: 's3',
        createdAt: '2026-08-07T12:00:00.000Z',
        updatedAt: '2026-08-07T12:01:00.000Z',
      })
    )
    fetch.mockResolvedValue(response(200, { runId: 'active-generation', status: 'running' }))

    await act(async () => {
      render('validate')
      await Promise.resolve()
    })

    expect(current.phase).toBe('idle')
    expect(current.isBusy).toBe(false)
    expect(current.isBlockedByOtherRun).toBe(true)
  })

  test('retries a same-session retryable failure as a new POST with the current draft', async () => {
    fetch
      .mockResolvedValueOnce(
        response(202, {
          runId: 'wrun_first_attempt',
          mode: 'generate',
          status: 'pending',
        })
      )
      .mockResolvedValueOnce(
        response(200, {
          runId: 'wrun_first_attempt',
          status: 'failed',
          failure: {
            schemaVersion: 1,
            code: 'provider_generation_failed',
            stage: 'generation',
            retryable: true,
            message: 'No se pudieron generar los borradores. Intenta nuevamente.',
          },
        })
      )
      .mockResolvedValueOnce(
        response(202, {
          runId: 'wrun_second_attempt',
          mode: 'generate',
          status: 'pending',
        })
      )
      .mockResolvedValueOnce(
        response(200, {
          runId: 'wrun_second_attempt',
          status: 'running',
        })
      )

    await act(async () => {
      render('generate')
      await Promise.resolve()
    })

    const originalDraft = {
      ...DEFAULT_GENERATION_FORM,
      contentType: 'regular_post',
      intent: 'educar',
      topic: 'tema original',
    }
    await act(async () => {
      await current.submitGeneration(originalDraft, undefined, ['facebook'])
      await Promise.resolve()
    })
    await act(async () => Promise.resolve())

    expect(current.phase).toBe('failed')
    expect(current.canRetry).toBe(true)
    expect(current.failure).toMatchObject({
      code: 'provider_generation_failed',
      retryable: true,
    })
    const firstPost = fetch.mock.calls.find(([url]) => url === '/api/admin/ai/generate')
    const firstToken = firstPost[1].headers.get('X-AI-Run-Token')

    const editedDraft = { ...originalDraft, topic: 'tema editado antes del reintento' }
    await act(async () => {
      await current.retryGeneration(editedDraft, undefined, ['facebook'])
      await Promise.resolve()
    })
    await act(async () => Promise.resolve())

    const posts = fetch.mock.calls.filter(([url]) => url === '/api/admin/ai/generate')
    expect(posts).toHaveLength(2)
    expect(JSON.parse(posts[1][1].body)).toMatchObject({
      topic: 'tema editado antes del reintento',
      platforms: ['facebook'],
    })
    expect(posts[1][1].headers.get('X-AI-Run-Token')).not.toBe(firstToken)
    expect(current.runId).toBe('wrun_second_attempt')
    expect(current.phase).toBe('polling')
  })

  test('does not offer one-click retry for a retryable run restored from storage', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: AI_RUN_STORAGE_VERSION,
        mode: 'generate',
        requestToken: null,
        runId: 'wrun_restored_failure',
        status: 'failed',
        coordination: 's3',
        createdAt: '2026-08-07T12:00:00.000Z',
        updatedAt: '2026-08-07T12:01:00.000Z',
      })
    )
    fetch.mockResolvedValue(
      response(200, {
        runId: 'wrun_restored_failure',
        status: 'failed',
        failure: {
          schemaVersion: 1,
          code: 'provider_generation_failed',
          stage: 'generation',
          retryable: true,
          message: 'No se pudieron generar los borradores. Intenta nuevamente.',
        },
      })
    )

    await act(async () => {
      render('generate')
      await Promise.resolve()
    })
    await act(async () => Promise.resolve())

    expect(current.phase).toBe('failed')
    expect(current.failure.retryable).toBe(true)
    expect(current.canRetry).toBe(false)

    const outcome = await current.retryGeneration(
      { ...DEFAULT_GENERATION_FORM, contentType: 'regular_post' },
      undefined,
      ['facebook']
    )
    expect(outcome).toEqual({ started: false, reason: 'retry-unavailable' })
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  })

  test('removes an unowned URL run only after two confirmed 404 responses', async () => {
    mockSearch = 'tab=generar&runId=unknown-run'
    fetch.mockResolvedValue(response(404, { error: 'No encontrado' }))

    await act(async () => {
      render('generate')
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mockReplace).toHaveBeenCalledWith('/admin/ai?tab=generar', { scroll: false })
  })
})
