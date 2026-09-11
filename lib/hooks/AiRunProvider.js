'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export const AI_RUN_STORAGE_VERSION = 1
export const AI_RUN_POLL_TIMEOUT_MS = 10 * 60 * 1000
export const AI_RUN_MODES = Object.freeze({
  GENERATE: 'generate',
  VALIDATE: 'validate',
})

const STORAGE_PREFIX = 'sac.ai-run.v1'
const POLL_INTERVAL_MS = 2000
const MAX_RETRY_MS = 10000
const URL_NOT_FOUND_CONFIRMATIONS = 2
const ACTIVE_STATUSES = new Set(['starting', 'pending', 'running'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'timeout'])
const VALID_STATUSES = new Set([...ACTIVE_STATUSES, ...TERMINAL_STATUSES])
const VALID_MODES = new Set(Object.values(AI_RUN_MODES))
const RUN_IDENTIFIER_PATTERN = /\b(?:wrun|run)_[a-z0-9_-]+\b/i
const WORKFLOW_ERROR_PREFIX = /^Workflow run\s+(?:"[^"]+"|'[^']+'|\S+)\s+failed:\s*/i

const FRIENDLY_FAILURE_MESSAGES = Object.freeze({
  policy_classification_unavailable:
    'La revisión de política no pudo completarse. No se confirmó una infracción del contenido; intenta nuevamente.',
  provider_generation_failed: 'No se pudieron generar los borradores. Intenta nuevamente.',
  required_image_unavailable: 'No se pudo preparar la imagen solicitada. Intenta nuevamente.',
  run_poll_timeout:
    'La ejecución sigue sin responder después del tiempo máximo de espera. Tu borrador se conservó; puedes volver a consultar el resultado recargando la página.',
})

const AiRunContext = createContext(null)

function nowIso() {
  return new Date().toISOString()
}

function emptySlot(hydrated = true) {
  return {
    hydrated,
    mode: null,
    requestToken: null,
    runId: null,
    status: 'idle',
    coordination: null,
    createdAt: null,
    updatedAt: null,
    payload: null,
    failure: null,
    error: null,
    // Deliberately memory-only. A restored/cross-tab run has no matching form
    // draft and therefore cannot be retried safely with one click.
    sessionStarted: false,
    draftSession: null,
    retryRequest: null,
    serverHydrated: false,
  }
}

function normalizeCoordination(value) {
  return value === 's3' || value === 'local' ? value : null
}

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : null
}

function normalizeStatus(value) {
  return VALID_STATUSES.has(value) ? value : null
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** A per-user key without putting run data or form data in browser storage. */
export function buildAiRunStorageKey(userKey) {
  const normalized = cleanString(userKey)
  return normalized ? `${STORAGE_PREFIX}.${encodeURIComponent(normalized)}` : null
}

export function parseAiRunPointer(value) {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object' || parsed.version !== AI_RUN_STORAGE_VERSION) {
    return null
  }

  const mode = normalizeMode(parsed.mode)
  const status = normalizeStatus(parsed.status)
  const requestToken = cleanString(parsed.requestToken)
  const runId = cleanString(parsed.runId)
  if (!mode || !status || (!requestToken && !runId)) return null
  if (status === 'starting' && !requestToken) return null

  return {
    hydrated: true,
    mode,
    requestToken,
    runId,
    status,
    coordination: normalizeCoordination(parsed.coordination),
    createdAt: cleanString(parsed.createdAt),
    updatedAt: cleanString(parsed.updatedAt),
    payload: null,
    failure: null,
    error: null,
    sessionStarted: false,
    draftSession: null,
    retryRequest: null,
    serverHydrated: false,
  }
}

export function serializeAiRunPointer(slot) {
  if (!slot?.mode || !VALID_MODES.has(slot.mode) || !VALID_STATUSES.has(slot.status)) {
    return null
  }

  return JSON.stringify({
    version: AI_RUN_STORAGE_VERSION,
    mode: slot.mode,
    requestToken: cleanString(slot.requestToken),
    runId: cleanString(slot.runId),
    status: slot.status,
    coordination: normalizeCoordination(slot.coordination),
    createdAt: cleanString(slot.createdAt),
    updatedAt: cleanString(slot.updatedAt),
  })
}

function persistAiRunPointer(storageKey, slot) {
  if (!storageKey || typeof window === 'undefined') return
  const serialized = serializeAiRunPointer(slot)
  if (serialized) window.localStorage.setItem(storageKey, serialized)
  else window.localStorage.removeItem(storageKey)
}

export function isAiRunBusy(slot) {
  return Boolean(slot?.mode && ACTIVE_STATUSES.has(slot.status))
}

export function aiRunPhase(slot, mode) {
  if (!slot || slot.mode !== mode) return 'idle'
  if (slot.status === 'starting') return 'submitting'
  if (slot.status === 'pending' || slot.status === 'running') return 'polling'
  if (slot.status === 'completed') return 'completed'
  if (slot.status === 'timeout') return 'timeout'
  if (slot.status === 'failed' || slot.status === 'cancelled') return 'failed'
  return 'idle'
}

export function buildAiRunHref(slot) {
  if (!slot?.mode) return '/admin/ai'

  const params = new URLSearchParams()
  if (slot.mode === AI_RUN_MODES.GENERATE) params.set('tab', 'generar')
  if (slot.runId) params.set('runId', slot.runId)
  const query = params.toString()
  return query ? `/admin/ai?${query}` : '/admin/ai'
}

export function createAiRunRequestToken() {
  const cryptoObject = globalThis.crypto
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID()
  if (typeof cryptoObject?.getRandomValues !== 'function') {
    throw new Error('Este navegador no puede crear un identificador seguro para la solicitud.')
  }

  const bytes = cryptoObject.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function retryDelay(failures) {
  return Math.min(POLL_INTERVAL_MS * 2 ** Math.min(Math.max(failures - 1, 0), 3), MAX_RETRY_MS)
}

function isSameRun(left, right) {
  return (
    left?.mode === right?.mode &&
    left?.runId === right?.runId &&
    left?.requestToken === right?.requestToken
  )
}

function isSamePersistedRun(left, right) {
  if (left?.mode !== right?.mode) return false
  if (left.runId && right.runId) return left.runId === right.runId
  return Boolean(left?.requestToken && left.requestToken === right?.requestToken)
}

function buildRetryRequest({ mode, url, body, headers, draftSession }) {
  if (
    mode !== AI_RUN_MODES.GENERATE ||
    !draftSession ||
    typeof url !== 'string' ||
    typeof body !== 'string'
  ) {
    return null
  }

  return {
    mode,
    url,
    body,
    headers: Array.from(new Headers(headers || {}).entries()),
    draftSession,
  }
}

function cleanFailureText(value) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : null
}

function friendlyFailureMessage(value, fallback) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null
  const rawCode = cleanFailureText(source?.code)
  const rawMessage = cleanFailureText(typeof value === 'string' ? value : source?.message)
  const withoutWorkflowPrefix = rawMessage?.replace(WORKFLOW_ERROR_PREFIX, '').trim()
  const looksLikeMachineIdentifier =
    withoutWorkflowPrefix &&
    /^[a-z0-9_.:-]+$/i.test(withoutWorkflowPrefix) &&
    /[_.:]/.test(withoutWorkflowPrefix)

  // Versioned sidecar messages are sanitized by buildAiRunFailure. Preserve a
  // specific public explanation without trusting arbitrary provider objects.
  if (
    source?.schemaVersion === 1 &&
    withoutWorkflowPrefix &&
    !RUN_IDENTIFIER_PATTERN.test(withoutWorkflowPrefix) &&
    !looksLikeMachineIdentifier &&
    withoutWorkflowPrefix.toLowerCase() !== rawCode?.toLowerCase()
  ) {
    return withoutWorkflowPrefix.slice(0, 500)
  }

  const mapped =
    FRIENDLY_FAILURE_MESSAGES[rawCode?.toLowerCase()] ||
    FRIENDLY_FAILURE_MESSAGES[rawMessage?.toLowerCase()]
  if (mapped) return mapped
  if (!withoutWorkflowPrefix || RUN_IDENTIFIER_PATTERN.test(withoutWorkflowPrefix)) return fallback

  // Unversioned structured errors may contain provider or SDK detail. Codes
  // remain available for classification, but their prose is not public copy.
  if (source) return fallback

  // Machine identifiers are useful in the retained failure object, not in the UI.
  if (looksLikeMachineIdentifier) return fallback
  return withoutWorkflowPrefix.slice(0, 500)
}

/** Keep the small public failure contract while making its display message safe. */
export function normalizeAiRunFailure(value, fallback = 'La ejecución de IA falló.') {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null
  const failure = {
    message: friendlyFailureMessage(value, fallback),
    retryable: source?.retryable === true,
  }
  const schemaVersion = Number.isInteger(source?.schemaVersion) ? source.schemaVersion : null
  const code = cleanFailureText(source?.code)
  const stage = cleanFailureText(source?.stage)
  if (schemaVersion !== null) failure.schemaVersion = schemaVersion
  if (code) failure.code = code.slice(0, 80)
  if (stage) failure.stage = stage.slice(0, 40)
  return failure
}

function responseFailure(body, fallback) {
  if (body?.failure && typeof body.failure === 'object') {
    return normalizeAiRunFailure(body.failure, fallback)
  }
  if (body?.error && typeof body.error === 'object') {
    return normalizeAiRunFailure(body.error, fallback)
  }
  return normalizeAiRunFailure(body?.details || body?.error, fallback)
}

function responseError(body, fallback) {
  return responseFailure(body, fallback).message
}

function cancelledMessage(mode) {
  return mode === AI_RUN_MODES.GENERATE
    ? 'La generación fue cancelada'
    : 'La validación fue cancelada'
}

function failedMessage(mode) {
  return mode === AI_RUN_MODES.GENERATE ? 'La generación falló' : 'La validación falló'
}

async function readResponseBody(response) {
  return response.json().catch(() => ({}))
}

/**
 * Owns the active AI request for the lifetime of the admin layout. Consumers may
 * unmount while its POST or polling continues.
 */
export function AiRunProvider({ userKey, children }) {
  const storageKey = useMemo(() => buildAiRunStorageKey(userKey), [userKey])
  const [slot, setSlot] = useState(() => emptySlot(false))
  const [recoveryEpoch, setRecoveryEpoch] = useState(0)
  const slotRef = useRef(slot)
  const mountedRef = useRef(false)
  const inFlightPostsRef = useRef(new Set())
  const pollStartedAtByRunRef = useRef(new Map())
  const urlMissingCountsRef = useRef(new Map())
  const adoptionRef = useRef(0)

  const commitSlot = useCallback(
    (value) => {
      if (!mountedRef.current) {
        const stored =
          !storageKey || typeof window === 'undefined'
            ? null
            : parseAiRunPointer(window.localStorage.getItem(storageKey))
        const current = stored || slotRef.current
        const next = typeof value === 'function' ? value(current) : value
        persistAiRunPointer(storageKey, next)
        return
      }

      // Direct values (notably the pre-POST `starting` marker) are written
      // synchronously so closing or navigating away cannot race persistence.
      if (typeof value !== 'function') persistAiRunPointer(storageKey, value)
      setSlot((current) => {
        const next = typeof value === 'function' ? value(current) : value
        if (typeof value === 'function') persistAiRunPointer(storageKey, next)
        slotRef.current = next
        return next
      })
    },
    [storageKey]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    slotRef.current = slot
  }, [slot])

  // Hydrate only the safe pointer. Results and errors are fetched again from the server.
  useEffect(() => {
    adoptionRef.current += 1
    inFlightPostsRef.current.clear()
    urlMissingCountsRef.current.clear()

    if (!storageKey || typeof window === 'undefined') {
      commitSlot(emptySlot(true))
      return
    }

    const raw = window.localStorage.getItem(storageKey)
    const pointer = parseAiRunPointer(raw)
    if (raw && !pointer) window.localStorage.removeItem(storageKey)
    commitSlot(pointer || emptySlot(true))
  }, [commitSlot, storageKey])

  useEffect(() => {
    if (!storageKey || !slot.hydrated || typeof window === 'undefined') return
    const serialized = serializeAiRunPointer(slot)
    if (serialized) {
      window.localStorage.setItem(storageKey, serialized)
    } else {
      window.localStorage.removeItem(storageKey)
    }
  }, [slot, storageKey])

  // Adopt newer pointers (and resets) written by another browser tab.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return undefined

    const onStorage = (event) => {
      if (event.key !== storageKey) return
      const current = slotRef.current
      const ownsPendingPost =
        current.requestToken && inFlightPostsRef.current.has(current.requestToken)

      adoptionRef.current += 1
      if (event.newValue === null) {
        if (ownsPendingPost) return
        commitSlot(emptySlot(true))
        return
      }

      const pointer = parseAiRunPointer(event.newValue)
      if (ownsPendingPost && pointer?.requestToken !== current.requestToken && !pointer?.runId) {
        return
      }
      if (pointer) {
        const sameRun = isSamePersistedRun(current, pointer)
        const preserveHydratedTerminal =
          sameRun && current.status === pointer.status && current.serverHydrated
        commitSlot(
          sameRun
            ? {
                ...pointer,
                requestToken: current.requestToken || pointer.requestToken,
                sessionStarted: current.sessionStarted,
                draftSession: current.draftSession,
                retryRequest: current.retryRequest,
                ...(preserveHydratedTerminal
                  ? {
                      payload: current.payload,
                      failure: current.failure,
                      error: current.error,
                      serverHydrated: true,
                    }
                  : null),
              }
            : pointer
        )
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [commitSlot, storageKey])

  // Recover a POST whose response was lost or a `starting` marker loaded after refresh.
  useEffect(() => {
    if (
      !slot.hydrated ||
      slot.status !== 'starting' ||
      slot.runId ||
      !slot.requestToken ||
      inFlightPostsRef.current.has(slot.requestToken)
    ) {
      return undefined
    }

    const identity = {
      mode: slot.mode,
      requestToken: slot.requestToken,
      runId: slot.runId,
    }
    let cancelled = false
    let timer = null
    let failures = 0

    const schedule = (delay) => {
      if (!cancelled) timer = window.setTimeout(recover, delay)
    }

    const recover = async () => {
      try {
        const response = await fetch('/api/admin/ai/runs/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestToken: identity.requestToken }),
        })

        if (cancelled) return
        if (response.status === 401) {
          window.location.assign('/auth/signin')
          return
        }

        const body = await readResponseBody(response)
        if (response.status === 404) {
          // Input/image validation can legitimately outlive the claim lease. A
          // starting marker is therefore never discarded based on age or 404s.
          failures += 1
          schedule(retryDelay(failures))
          return
        }

        if (response.status === 429 || response.status >= 500) {
          throw new Error(responseError(body, 'No se pudo recuperar la solicitud'))
        }
        if (!response.ok) {
          const failure = responseFailure(body, 'No se pudo recuperar la solicitud')
          commitSlot((current) =>
            isSameRun(current, identity)
              ? {
                  ...current,
                  status: 'failed',
                  failure,
                  error: failure.message,
                  updatedAt: nowIso(),
                  serverHydrated: true,
                }
              : current
          )
          return
        }

        failures = 0
        const runId = cleanString(body.runId)
        if (runId) {
          commitSlot((current) =>
            isSameRun(current, identity)
              ? {
                  ...current,
                  mode: normalizeMode(body.mode) || current.mode,
                  runId,
                  // Always inspect the run to hydrate terminal result/error safely.
                  status: ACTIVE_STATUSES.has(body.status) ? body.status : 'pending',
                  coordination: normalizeCoordination(body.coordination) || current.coordination,
                  updatedAt: nowIso(),
                  failure: null,
                  error: null,
                  serverHydrated: false,
                }
              : current
          )
          return
        }

        commitSlot((current) =>
          isSameRun(current, identity)
            ? {
                ...current,
                coordination: normalizeCoordination(body.coordination) || current.coordination,
                updatedAt: nowIso(),
              }
            : current
        )
        schedule(POLL_INTERVAL_MS)
      } catch {
        failures += 1
        schedule(retryDelay(failures))
      }
    }

    // Give the originating POST enough time to create its claim in another tab.
    schedule(750)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [
    commitSlot,
    recoveryEpoch,
    slot.hydrated,
    slot.mode,
    slot.requestToken,
    slot.runId,
    slot.status,
  ])

  // Poll centrally. Transient failures back off, but the UI eventually yields a recoverable
  // timeout instead of spinning forever. The workflow itself is not cancelled; a reload can
  // inspect the persisted run pointer and recover a result that completed later.
  useEffect(() => {
    const shouldInspect =
      slot.hydrated && slot.runId && (ACTIVE_STATUSES.has(slot.status) || !slot.serverHydrated)
    if (!shouldInspect) return undefined

    const identity = {
      mode: slot.mode,
      requestToken: slot.requestToken,
      runId: slot.runId,
    }
    let cancelled = false
    let timer = null
    let failures = 0

    if (!pollStartedAtByRunRef.current.has(identity.runId)) {
      pollStartedAtByRunRef.current.set(identity.runId, Date.now())
    }

    const clearPollingClock = () => {
      pollStartedAtByRunRef.current.delete(identity.runId)
    }

    const timeoutIfElapsed = () => {
      const pollingStartedAt = pollStartedAtByRunRef.current.get(identity.runId)
      if (!Number.isFinite(pollingStartedAt)) return false
      if (Date.now() - pollingStartedAt < AI_RUN_POLL_TIMEOUT_MS) return false

      const failure = normalizeAiRunFailure(
        {
          schemaVersion: 1,
          code: 'run_poll_timeout',
          stage: 'status',
          retryable: true,
          message: 'run_poll_timeout',
        },
        'La ejecución tardó demasiado.'
      )
      clearPollingClock()
      commitSlot((current) =>
        isSameRun(current, identity)
          ? {
              ...current,
              status: 'timeout',
              payload: null,
              failure,
              error: failure.message,
              updatedAt: nowIso(),
              serverHydrated: true,
            }
          : current
      )
      return true
    }

    const schedule = (delay) => {
      if (cancelled) return
      const pollingStartedAt = pollStartedAtByRunRef.current.get(identity.runId)
      const remaining = Number.isFinite(pollingStartedAt)
        ? Math.max(AI_RUN_POLL_TIMEOUT_MS - (Date.now() - pollingStartedAt), 0)
        : delay
      timer = window.setTimeout(poll, Math.min(delay, remaining))
    }

    const poll = async () => {
      if (timeoutIfElapsed()) return
      try {
        const response = await fetch(`/api/admin/ai/runs/${encodeURIComponent(identity.runId)}`)
        if (cancelled) return

        if (response.status === 401) {
          window.location.assign('/auth/signin')
          return
        }

        const body = await readResponseBody(response)
        if (response.status === 404) {
          const count = (urlMissingCountsRef.current.get(identity.runId) || 0) + 1
          urlMissingCountsRef.current.set(identity.runId, count)
          if (count < URL_NOT_FOUND_CONFIRMATIONS) {
            schedule(POLL_INTERVAL_MS)
            return
          }
          commitSlot((current) => (isSameRun(current, identity) ? emptySlot(true) : current))
          clearPollingClock()
          return
        }

        if (response.status === 429 || response.status >= 500) {
          throw new Error(responseError(body, 'No se pudo consultar la ejecución'))
        }
        if (!response.ok) {
          const failure = responseFailure(body, 'No se pudo consultar la ejecución')
          commitSlot((current) =>
            isSameRun(current, identity)
              ? {
                  ...current,
                  status: 'failed',
                  payload: null,
                  failure,
                  error: failure.message,
                  updatedAt: nowIso(),
                  serverHydrated: true,
                }
              : current
          )
          return
        }

        failures = 0
        urlMissingCountsRef.current.delete(identity.runId)
        const status = normalizeStatus(body.status)
        if (status === 'completed') {
          clearPollingClock()
          commitSlot((current) =>
            isSameRun(current, identity)
              ? {
                  ...current,
                  status,
                  payload: body.result ?? null,
                  failure: null,
                  error: null,
                  updatedAt: cleanString(body.updatedAt) || nowIso(),
                  coordination: normalizeCoordination(body.coordination) || current.coordination,
                  serverHydrated: true,
                }
              : current
          )
          return
        }

        if (status === 'failed' || status === 'cancelled') {
          clearPollingClock()
          const failure =
            status === 'cancelled'
              ? normalizeAiRunFailure(null, cancelledMessage(identity.mode))
              : responseFailure(body, failedMessage(identity.mode))
          commitSlot((current) =>
            isSameRun(current, identity)
              ? {
                  ...current,
                  status,
                  payload: null,
                  failure,
                  error: failure.message,
                  updatedAt: cleanString(body.updatedAt) || nowIso(),
                  coordination: normalizeCoordination(body.coordination) || current.coordination,
                  serverHydrated: true,
                }
              : current
          )
          return
        }

        commitSlot((current) =>
          isSameRun(current, identity)
            ? {
                ...current,
                status: status === 'running' ? 'running' : 'pending',
                failure: null,
                error: null,
                createdAt: cleanString(body.createdAt) || current.createdAt,
                updatedAt: cleanString(body.updatedAt) || nowIso(),
                coordination: normalizeCoordination(body.coordination) || current.coordination,
              }
            : current
        )
        schedule(POLL_INTERVAL_MS)
      } catch {
        failures += 1
        schedule(retryDelay(failures))
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [
    commitSlot,
    slot.hydrated,
    slot.mode,
    slot.requestToken,
    slot.runId,
    slot.serverHydrated,
    slot.status,
  ])

  const startRun = useCallback(
    async ({ mode, url, body, headers, draftSession = null }) => {
      const normalizedMode = normalizeMode(mode)
      if (!normalizedMode) throw new Error('Modo de ejecución AI inválido')
      if (isAiRunBusy(slotRef.current)) return { started: false, reason: 'active' }

      const requestToken = createAiRunRequestToken()
      const timestamp = nowIso()
      const retryRequest = buildRetryRequest({
        mode: normalizedMode,
        url,
        body,
        headers,
        draftSession,
      })
      const identity = {
        ...emptySlot(true),
        mode: normalizedMode,
        requestToken,
        status: 'starting',
        createdAt: timestamp,
        updatedAt: timestamp,
        sessionStarted: true,
        draftSession: retryRequest?.draftSession || null,
        retryRequest,
      }
      inFlightPostsRef.current.add(requestToken)
      adoptionRef.current += 1
      commitSlot(identity)

      try {
        const requestHeaders = new Headers(headers || {})
        requestHeaders.set('X-AI-Run-Token', requestToken)
        const response = await fetch(url, {
          method: 'POST',
          headers: requestHeaders,
          body,
        })
        if (response.status === 401) {
          if (mountedRef.current) window.location.assign('/auth/signin')
          return { started: false, reason: 'unauthenticated' }
        }

        const responseBody = await readResponseBody(response)
        if (!response.ok) {
          const activeMode = normalizeMode(
            responseBody.mode || responseBody.activeMode || responseBody.active?.mode
          )
          const fallback =
            response.status === 409 && responseBody.code === 'AI_RUN_ACTIVE'
              ? `Ya hay una ${activeMode === AI_RUN_MODES.GENERATE ? 'generación' : 'validación'} en curso.`
              : normalizedMode === AI_RUN_MODES.GENERATE
                ? 'No se pudo iniciar la generación'
                : 'No se pudo iniciar la validación'
          const failure = responseFailure(responseBody, fallback)
          commitSlot((current) =>
            current.requestToken === requestToken
              ? {
                  ...current,
                  status: 'failed',
                  failure,
                  error: failure.message,
                  updatedAt: nowIso(),
                  serverHydrated: true,
                }
              : current
          )
          return { started: false, reason: 'rejected', response: responseBody }
        }

        const runId = cleanString(responseBody.runId)
        if (!runId && responseBody.status === 'starting') {
          commitSlot((current) =>
            current.requestToken === requestToken
              ? {
                  ...current,
                  mode: normalizeMode(responseBody.mode) || normalizedMode,
                  status: 'starting',
                  coordination: normalizeCoordination(responseBody.coordination),
                  updatedAt: nowIso(),
                  failure: null,
                  error: null,
                }
              : current
          )
          return { started: true, runId: null, requestToken }
        }
        if (!runId) throw new Error('Respuesta sin runId')
        commitSlot((current) =>
          current.requestToken === requestToken
            ? {
                ...current,
                mode: normalizeMode(responseBody.mode) || normalizedMode,
                runId,
                status: ACTIVE_STATUSES.has(responseBody.status) ? responseBody.status : 'pending',
                coordination: normalizeCoordination(responseBody.coordination),
                updatedAt: nowIso(),
                failure: null,
                error: null,
                serverHydrated: false,
              }
            : current
        )
        return { started: true, runId, requestToken }
      } catch (error) {
        // An ambiguous network failure may still have created the workflow. Keep
        // the marker and let the recovery endpoint resolve it by request token.
        const failure = normalizeAiRunFailure(
          error,
          'No se pudo confirmar el inicio de la solicitud.'
        )
        commitSlot((current) =>
          current.requestToken === requestToken
            ? {
                ...current,
                status: 'starting',
                failure,
                error: failure.message,
                updatedAt: nowIso(),
              }
            : current
        )
        return { started: false, reason: 'recovering' }
      } finally {
        inFlightPostsRef.current.delete(requestToken)
        if (mountedRef.current) setRecoveryEpoch((value) => value + 1)
      }
    },
    [commitSlot]
  )

  /** Validate a URL run before replacing the persisted pointer. */
  const adoptUrlRun = useCallback(
    async (mode, runId) => {
      const normalizedMode = normalizeMode(mode)
      const normalizedRunId = cleanString(runId)
      if (!normalizedMode || !normalizedRunId) return { status: 'not-found' }
      if (slotRef.current.mode === normalizedMode && slotRef.current.runId === normalizedRunId) {
        return { status: 'adopted' }
      }

      const adoption = ++adoptionRef.current
      try {
        const response = await fetch(`/api/admin/ai/runs/${encodeURIComponent(normalizedRunId)}`)
        if (response.status === 401) {
          window.location.assign('/auth/signin')
          return { status: 'unauthenticated' }
        }

        const body = await readResponseBody(response)
        if (response.status === 404) {
          const count = (urlMissingCountsRef.current.get(normalizedRunId) || 0) + 1
          urlMissingCountsRef.current.set(normalizedRunId, count)
          if (count < URL_NOT_FOUND_CONFIRMATIONS) return { status: 'retry' }
          urlMissingCountsRef.current.delete(normalizedRunId)
          return { status: 'not-found' }
        }
        if (response.status === 429 || response.status >= 500) return { status: 'retry' }
        if (!response.ok) return { status: 'not-found' }
        if (adoption !== adoptionRef.current) return { status: 'superseded' }

        urlMissingCountsRef.current.delete(normalizedRunId)
        const status = normalizeStatus(body.status) || 'pending'
        const previous = slotRef.current
        const nextMode = normalizeMode(body.mode) || normalizedMode
        const preserveSession = previous.runId === normalizedRunId
        const failure =
          status === 'cancelled'
            ? normalizeAiRunFailure(null, cancelledMessage(nextMode))
            : status === 'failed'
              ? responseFailure(body, failedMessage(nextMode))
              : null
        commitSlot({
          ...emptySlot(true),
          mode: nextMode,
          requestToken: preserveSession ? previous.requestToken : null,
          runId: normalizedRunId,
          status,
          coordination: normalizeCoordination(body.coordination) || previous.coordination,
          createdAt: cleanString(body.createdAt) || previous.createdAt || nowIso(),
          updatedAt: cleanString(body.updatedAt) || nowIso(),
          payload: status === 'completed' ? (body.result ?? null) : null,
          failure,
          error: failure?.message || null,
          sessionStarted: preserveSession ? previous.sessionStarted === true : false,
          draftSession: preserveSession ? previous.draftSession : null,
          retryRequest: preserveSession ? previous.retryRequest : null,
          serverHydrated: TERMINAL_STATUSES.has(status),
        })
        return { status: 'adopted' }
      } catch {
        return { status: 'retry' }
      }
    },
    [commitSlot]
  )

  const resetRun = useCallback(
    (mode) => {
      if (mode && slotRef.current.mode !== mode) return
      adoptionRef.current += 1
      commitSlot(emptySlot(true))
    },
    [commitSlot]
  )

  const value = useMemo(
    () => ({ slot, startRun, adoptUrlRun, resetRun }),
    [adoptUrlRun, resetRun, slot, startRun]
  )

  return <AiRunContext.Provider value={value}>{children}</AiRunContext.Provider>
}

export function useAiRunCoordinator() {
  const value = useContext(AiRunContext)
  if (!value) throw new Error('useAiRunCoordinator debe usarse dentro de AiRunProvider')
  return value
}

export function useOptionalAiRunCoordinator() {
  return useContext(AiRunContext)
}

/** Silent recovery href for navigation components outside the AI page. */
export function useAiRunHref() {
  const value = useOptionalAiRunCoordinator()
  return buildAiRunHref(value?.slot)
}
