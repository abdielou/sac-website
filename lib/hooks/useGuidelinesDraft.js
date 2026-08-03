'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const AUTOSAVE_DELAY_MS = 1000
const REQUEST_TIMEOUT_MS = 15000
const AUTOSAVE_FAILURE_MESSAGE = 'No se pudo guardar el borrador.'
const AUTOSAVE_CONFLICT_MESSAGE =
  'El borrador cambió en otro lugar. Conservamos tus cambios para que puedas reintentar.'
const MISSING_DRAFT_RECOVERY_MESSAGE =
  'El borrador original ya no existe. Recuperamos tus cambios sobre el borrador actual; reintenta para guardarlos.'

class GuidelinesRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'GuidelinesRequestError'
    this.status = status
  }
}

async function readErrorMessage(res, fallback) {
  try {
    const data = await res.json()
    if (typeof data?.error === 'string' && data.error) return data.error
    if (typeof data?.details === 'string' && data.details) return data.details
    return fallback
  } catch {
    return fallback
  }
}

async function requestJson(url, options, fallback, { timeoutMessage } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...(options || {}), signal: controller.signal })
    if (!res.ok) {
      throw new GuidelinesRequestError(await readErrorMessage(res, fallback), res.status)
    }
    return await res.json()
  } catch (err) {
    if (controller.signal.aborted) {
      throw new GuidelinesRequestError(
        timeoutMessage || 'La operación tardó demasiado. Inténtalo de nuevo.',
        408
      )
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function cloneJson(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`
}

function sameDocument(left, right) {
  return stableSerialize(left) === stableSerialize(right)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableArrayKey(...arrays) {
  const entries = arrays.flat().filter((entry) => entry !== undefined)
  if (entries.length === 0 || entries.some((entry) => !isPlainObject(entry))) return null

  for (const candidate of ['id', 'key']) {
    const values = entries.map((entry) => entry[candidate])
    const valid = values.every(
      (value) => (typeof value === 'string' && value.length > 0) || typeof value === 'number'
    )
    if (!valid) continue

    const uniquePerArray = arrays.every((array) => {
      const identities = array.map((entry) => entry[candidate])
      return new Set(identities).size === identities.length
    })
    if (uniquePerArray) return candidate
  }

  return null
}

function mergeIdentityArray(base, local, remote, identityKey) {
  const baseById = new Map(base.map((entry) => [entry[identityKey], entry]))
  const localById = new Map(local.map((entry) => [entry[identityKey], entry]))
  const remoteById = new Map(remote.map((entry) => [entry[identityKey], entry]))
  const locallyDeletedIds = new Set(
    base.filter((entry) => !localById.has(entry[identityKey])).map((entry) => entry[identityKey])
  )
  const result = []

  // Keep the latest server ordering and all server-only entries. Only the matching item receives
  // the local field patch, so editing one catalog type or field cannot revert a sibling.
  for (const remoteEntry of remote) {
    const identity = remoteEntry[identityKey]
    if (locallyDeletedIds.has(identity)) continue

    const baseEntry = baseById.get(identity)
    const localEntry = localById.get(identity)
    if (baseEntry && localEntry) {
      result.push(mergeThreeWayValue(baseEntry, localEntry, remoteEntry))
    } else if (!baseEntry && localEntry) {
      // Both sides added the same stable identity. Preserve remote-only fields while applying the
      // complete local addition as the intentional local patch.
      result.push(mergeThreeWayValue({}, localEntry, remoteEntry))
    } else {
      result.push(cloneJson(remoteEntry))
    }
  }

  // Local additions and locally edited entries deleted remotely are appended in local order.
  // Reinstating an edited entry is safer than silently dropping the user's unsaved work.
  for (const localEntry of local) {
    const identity = localEntry[identityKey]
    if (remoteById.has(identity)) continue
    const baseEntry = baseById.get(identity)
    if (!baseEntry || !sameDocument(baseEntry, localEntry)) result.push(cloneJson(localEntry))
  }

  const baseOrderKeptLocally = base
    .map((entry) => entry[identityKey])
    .filter((identity) => localById.has(identity))
  const localBaseOrder = local
    .map((entry) => entry[identityKey])
    .filter((identity) => baseById.has(identity))
  const reorderedLocally = !sameDocument(baseOrderKeptLocally, localBaseOrder)
  const hasLocalAdditions = local.some((entry) => !baseById.has(entry[identityKey]))
  if (!reorderedLocally && !hasLocalAdditions) return result

  // A deliberate local reorder is itself a patch. Apply it to every locally known identity, then
  // append server-only additions in their server order so concurrent additions are never lost.
  const resultById = new Map(result.map((entry) => [entry[identityKey], entry]))
  const reordered = []
  for (const localEntry of local) {
    const identity = localEntry[identityKey]
    if (!resultById.has(identity)) continue
    reordered.push(resultById.get(identity))
    resultById.delete(identity)
  }
  for (const remoteEntry of result) {
    const identity = remoteEntry[identityKey]
    if (!resultById.has(identity)) continue
    reordered.push(resultById.get(identity))
    resultById.delete(identity)
  }

  return reordered
}

function mergeThreeWayValue(base, local, remote) {
  if (sameDocument(base, local)) return cloneJson(remote)

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const identityKey = stableArrayKey(base, local, remote)
    return identityKey ? mergeIdentityArray(base, local, remote, identityKey) : cloneJson(local)
  }

  if (!isPlainObject(base) || !isPlainObject(local)) return cloneJson(local)

  const result = isPlainObject(remote) ? cloneJson(remote) : {}
  const keys = new Set([...Object.keys(base), ...Object.keys(local)])
  for (const key of keys) {
    const hasBase = Object.prototype.hasOwnProperty.call(base, key)
    const hasLocal = Object.prototype.hasOwnProperty.call(local, key)
    const hasRemote = isPlainObject(remote) && Object.prototype.hasOwnProperty.call(remote, key)

    if (!hasLocal) {
      delete result[key]
    } else if (!hasBase) {
      result[key] = hasRemote
        ? mergeThreeWayValue(undefined, local[key], remote[key])
        : cloneJson(local[key])
    } else if (hasRemote) {
      result[key] = mergeThreeWayValue(base[key], local[key], remote[key])
    } else if (!sameDocument(base[key], local[key])) {
      result[key] = cloneJson(local[key])
    } else {
      delete result[key]
    }
  }

  return result
}

/**
 * Reapplies only fields changed by the local editor onto a newer server document.
 * Exported for focused tests; the hook remains the public UI integration surface.
 */
export function mergeGuidelineDraftChanges(base, local, remote) {
  return mergeThreeWayValue(base, local, remote)
}

/**
 * Server-backed guidelines draft/active state (S3 via admin AI APIs).
 */
export function useGuidelinesDraft({ canWrite }) {
  const [active, setActive] = useState(null)
  const [draft, setDraftState] = useState(null)
  const [viewModeState, setViewModeState] = useState('active')
  const [versions, setVersions] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [operationLoading, setOperationLoading] = useState(false)
  const [error, setError] = useState(null)
  const [autosaveStatusState, setAutosaveStatusState] = useState('clean')
  const [autosaveError, setAutosaveError] = useState(null)

  const draftRef = useRef(null)
  const viewModeRef = useRef('active')
  const lastSavedDocumentRef = useRef(null)
  const inFlightSaveRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const autosaveStatusRef = useRef('clean')
  const autosaveFailureRef = useRef(null)
  const operationPromiseRef = useRef(null)
  const hasAppliedWorkspaceRef = useRef(false)
  const initialRefreshStartedRef = useRef(false)

  const setDraft = useCallback((nextDraft) => {
    draftRef.current = nextDraft
    setDraftState(nextDraft)
  }, [])

  const setViewModeValue = useCallback((nextMode) => {
    viewModeRef.current = nextMode
    setViewModeState(nextMode)
  }, [])

  const setAutosaveStatus = useCallback((nextStatus) => {
    autosaveStatusRef.current = nextStatus
    setAutosaveStatusState(nextStatus)
  }, [])

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }, [])

  const markAutosaveFailure = useCallback(
    (failure, status = 'error') => {
      const message = failure?.message || AUTOSAVE_FAILURE_MESSAGE
      autosaveFailureRef.current = failure || new Error(message)
      setAutosaveError(message)
      setError(message)
      setAutosaveStatus(status)
    },
    [setAutosaveStatus]
  )

  const adoptServerDraft = useCallback(
    (serverDraft, { localDocument = null, status = 'clean' } = {}) => {
      if (!serverDraft?.document) {
        lastSavedDocumentRef.current = null
        setDraft(null)
        setAutosaveStatus('clean')
        setAutosaveError(null)
        autosaveFailureRef.current = null
        return null
      }

      lastSavedDocumentRef.current = cloneJson(serverDraft.document)
      const nextDraft = localDocument
        ? { ...serverDraft, document: localDocument }
        : { ...serverDraft, document: cloneJson(serverDraft.document) }
      setDraft(nextDraft)
      setAutosaveStatus(status)
      setAutosaveError(null)
      autosaveFailureRef.current = null
      return nextDraft
    },
    [setAutosaveStatus, setDraft]
  )

  const applyWorkspace = useCallback(
    (workspace, { preserveLocal = true, preferredView = null } = {}) => {
      const incomingDraft = workspace?.draft || null
      const currentDraft = draftRef.current
      const savedDocument = lastSavedDocumentRef.current
      const hasLocalChanges = Boolean(
        currentDraft?.document &&
        savedDocument &&
        !sameDocument(currentDraft.document, savedDocument)
      )

      setActive(workspace?.active || null)
      setVersions(workspace?.versions || [])
      setAuditLog(workspace?.auditLog || [])

      let nextDraft
      if (
        preserveLocal &&
        hasLocalChanges &&
        incomingDraft?.document &&
        incomingDraft.id === currentDraft.id
      ) {
        const mergedDocument = mergeGuidelineDraftChanges(
          savedDocument,
          currentDraft.document,
          incomingDraft.document
        )
        const nextStatus = sameDocument(mergedDocument, incomingDraft.document) ? 'clean' : 'dirty'
        nextDraft = adoptServerDraft(incomingDraft, {
          localDocument: mergedDocument,
          status: nextStatus,
        })
      } else if (preserveLocal && hasLocalChanges && incomingDraft?.id !== currentDraft?.id) {
        // The server-side draft was removed or replaced. Keep the local copy intact so the user
        // can recover it instead of silently losing edits.
        nextDraft = currentDraft
        markAutosaveFailure(new Error(AUTOSAVE_CONFLICT_MESSAGE), 'conflict')
      } else {
        nextDraft = adoptServerDraft(incomingDraft)
      }

      let nextView = preferredView
      if (!nextView && !hasAppliedWorkspaceRef.current) nextView = nextDraft ? 'draft' : 'active'
      if (!nextView) nextView = viewModeRef.current
      if (nextView === 'draft' && !nextDraft) nextView = 'active'
      setViewModeValue(nextView)
      hasAppliedWorkspaceRef.current = true

      return { ...workspace, draft: nextDraft }
    },
    [adoptServerDraft, markAutosaveFailure, setViewModeValue]
  )

  const fetchWorkspace = useCallback(() => {
    return requestJson('/api/admin/ai/guidelines', undefined, 'No se pudieron cargar las guías.', {
      timeoutMessage: 'La carga de las guías tardó demasiado. Inténtalo de nuevo.',
    })
  }, [])

  const refresh = useCallback(
    async (options = {}) => {
      setRefreshing(true)
      setError(null)
      try {
        const workspace = await fetchWorkspace()
        return applyWorkspace(workspace, options)
      } catch (err) {
        const message = err?.message || 'Error al cargar guías'
        setError(message)
        throw err
      } finally {
        setRefreshing(false)
        setHydrated(true)
      }
    },
    [applyWorkspace, fetchWorkspace]
  )

  useEffect(() => {
    if (initialRefreshStartedRef.current) return
    initialRefreshStartedRef.current = true
    refresh().catch(() => {})
  }, [refresh])

  const withWrite = useCallback(
    async (fn) => {
      if (!canWrite) return null
      if (operationPromiseRef.current) return operationPromiseRef.current

      const operation = (async () => {
        setOperationLoading(true)
        setError(null)
        try {
          return await fn()
        } catch (err) {
          setError(err?.message || 'Operación fallida')
          return null
        } finally {
          setOperationLoading(false)
        }
      })()

      operationPromiseRef.current = operation
      try {
        return await operation
      } finally {
        if (operationPromiseRef.current === operation) operationPromiseRef.current = null
      }
    },
    [canWrite]
  )

  const createDraftFromActive = useCallback(
    (basedOnVersion) => {
      const existingDraft = draftRef.current
      if (existingDraft) {
        setViewModeValue('draft')
        return Promise.resolve(existingDraft)
      }

      return withWrite(async () => {
        try {
          const data = await requestJson(
            '/api/admin/ai/guidelines/drafts',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(basedOnVersion ? { basedOnVersion } : {}),
            },
            'No se pudo crear el borrador.'
          )
          const nextDraft = adoptServerDraft(data.draft)
          if (data.auditLog) setAuditLog(data.auditLog)
          setViewModeValue('draft')
          return nextDraft
        } catch (err) {
          if (err?.status !== 409) throw err

          // Another request may have created the singleton draft first. Recover it and reuse it.
          const workspace = await fetchWorkspace()
          if (!workspace?.draft) throw err
          const applied = applyWorkspace(workspace, {
            preserveLocal: false,
            preferredView: 'draft',
          })
          return applied.draft
        }
      })
    },
    [adoptServerDraft, applyWorkspace, fetchWorkspace, setViewModeValue, withWrite]
  )

  const updateDraft = useCallback(
    (patch) => {
      if (!canWrite) return null
      const current = draftRef.current
      if (!current?.document) return null

      const nextDocument =
        typeof patch === 'function'
          ? patch(current.document)
          : {
              ...current.document,
              ...patch,
            }

      if (!nextDocument || sameDocument(current.document, nextDocument)) return current

      const nextDraft = { ...current, document: nextDocument }
      setDraft(nextDraft)
      setAutosaveError(null)
      autosaveFailureRef.current = null
      setAutosaveStatus('dirty')
      return nextDraft
    },
    [canWrite, setAutosaveStatus, setDraft]
  )

  const saveRequest = useCallback(async (draftRecord, document) => {
    if (!Number.isInteger(draftRecord?.revision)) {
      throw new Error('El borrador no tiene una revisión válida para guardar.')
    }

    return requestJson(
      `/api/admin/ai/guidelines/drafts/${encodeURIComponent(draftRecord.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document,
          expectedRevision: draftRecord.revision,
        }),
      },
      AUTOSAVE_FAILURE_MESSAGE
    )
  }, [])

  const recoverMissingDraft = useCallback(
    async (baseDocument) => {
      let workspace = await fetchWorkspace()
      let serverDraft = workspace?.draft || null

      if (!serverDraft) {
        try {
          const created = await requestJson(
            '/api/admin/ai/guidelines/drafts',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
            'No se pudo recuperar el borrador.'
          )
          serverDraft = created?.draft || null
          workspace = {
            ...workspace,
            draft: serverDraft,
            auditLog: created?.auditLog || workspace?.auditLog || [],
          }
        } catch (createError) {
          if (createError?.status !== 409) throw createError
          workspace = await fetchWorkspace()
          serverDraft = workspace?.draft || null
        }
      }

      const current = draftRef.current
      if (!current?.document || !serverDraft?.document) {
        throw new Error('No se encontró un borrador donde recuperar tus cambios.')
      }

      const mergedDocument = mergeGuidelineDraftChanges(
        baseDocument,
        current.document,
        serverDraft.document
      )
      setActive(workspace?.active || null)
      setVersions(workspace?.versions || [])
      setAuditLog(workspace?.auditLog || [])
      return adoptServerDraft(serverDraft, {
        localDocument: mergedDocument,
        status: 'dirty',
      })
    },
    [adoptServerDraft, fetchWorkspace]
  )

  const applySaveSuccess = useCallback(
    (data, submittedDocument) => {
      const savedDraft = data?.draft
      if (!savedDraft?.document || !Number.isInteger(savedDraft.revision)) {
        throw new Error('El servidor no devolvió el borrador guardado.')
      }

      const current = draftRef.current
      const hasNewerLocalChanges = Boolean(
        current?.id === savedDraft.id && !sameDocument(current.document, submittedDocument)
      )
      const localDocument = hasNewerLocalChanges ? current.document : null
      const nextDraft = adoptServerDraft(savedDraft, {
        localDocument,
        status: hasNewerLocalChanges ? 'dirty' : 'saved',
      })
      if (data.auditLog) setAuditLog(data.auditLog)
      setError(null)
      return nextDraft
    },
    [adoptServerDraft]
  )

  const applyConflictWorkspace = useCallback(
    (workspace, baseDocument, { terminal = false } = {}) => {
      setActive(workspace?.active || null)
      setVersions(workspace?.versions || [])
      setAuditLog(workspace?.auditLog || [])

      const current = draftRef.current
      const serverDraft = workspace?.draft
      if (!current?.document || !serverDraft?.document || current.id !== serverDraft.id) {
        const conflict = new Error(AUTOSAVE_CONFLICT_MESSAGE)
        markAutosaveFailure(conflict, 'conflict')
        throw conflict
      }

      const mergedDocument = mergeGuidelineDraftChanges(
        baseDocument,
        current.document,
        serverDraft.document
      )
      const nextDraft = adoptServerDraft(serverDraft, {
        localDocument: mergedDocument,
        status: terminal ? 'conflict' : 'dirty',
      })

      if (terminal) {
        const conflict = new Error(AUTOSAVE_CONFLICT_MESSAGE)
        markAutosaveFailure(conflict, 'conflict')
        throw conflict
      }

      return nextDraft
    },
    [adoptServerDraft, markAutosaveFailure]
  )

  const performSaveOnce = useCallback(async () => {
    if (!canWrite) return draftRef.current

    const localDraft = draftRef.current
    if (!localDraft?.id || !localDraft.document) return localDraft

    const baseDocument = lastSavedDocumentRef.current || localDraft.document
    if (sameDocument(localDraft.document, baseDocument)) {
      setAutosaveStatus(autosaveStatusRef.current === 'clean' ? 'clean' : 'saved')
      setAutosaveError(null)
      autosaveFailureRef.current = null
      return localDraft
    }

    clearAutosaveTimer()
    setAutosaveStatus('saving')
    setAutosaveError(null)
    autosaveFailureRef.current = null

    try {
      const data = await saveRequest(localDraft, localDraft.document)
      return applySaveSuccess(data, localDraft.document)
    } catch (err) {
      if (err?.status === 404) {
        let recoveredDraft
        try {
          recoveredDraft = await recoverMissingDraft(baseDocument)
        } catch (recoveryError) {
          markAutosaveFailure(recoveryError, 'error')
          throw recoveryError
        }
        const recovery = new Error(MISSING_DRAFT_RECOVERY_MESSAGE)
        markAutosaveFailure(recovery, 'conflict')
        return recoveredDraft
      }

      if (err?.status !== 409) {
        markAutosaveFailure(err, 'error')
        throw err
      }

      // First conflict: refresh the server revision, reapply only local changes, and retry once.
      let workspace
      try {
        workspace = await fetchWorkspace()
      } catch (refreshError) {
        markAutosaveFailure(refreshError, 'conflict')
        throw refreshError
      }

      const rebasedDraft = applyConflictWorkspace(workspace, baseDocument)
      setAutosaveStatus('saving')
      try {
        const retryData = await saveRequest(rebasedDraft, rebasedDraft.document)
        return applySaveSuccess(retryData, rebasedDraft.document)
      } catch (retryError) {
        if (retryError?.status !== 409) {
          markAutosaveFailure(retryError, 'error')
          throw retryError
        }

        // A second conflict is not overwritten. Refresh once more only to retain the newest
        // revision underneath the local patch, then require an explicit retry from the user.
        try {
          const latestWorkspace = await fetchWorkspace()
          applyConflictWorkspace(latestWorkspace, lastSavedDocumentRef.current, {
            terminal: true,
          })
        } catch (terminalError) {
          if (autosaveStatusRef.current !== 'conflict') {
            markAutosaveFailure(new Error(AUTOSAVE_CONFLICT_MESSAGE), 'conflict')
          }
          throw terminalError
        }

        const conflict = new Error(AUTOSAVE_CONFLICT_MESSAGE)
        markAutosaveFailure(conflict, 'conflict')
        throw conflict
      }
    }
  }, [
    applyConflictWorkspace,
    applySaveSuccess,
    canWrite,
    clearAutosaveTimer,
    fetchWorkspace,
    markAutosaveFailure,
    recoverMissingDraft,
    saveRequest,
    setAutosaveStatus,
  ])

  const persistCurrentOnce = useCallback(async () => {
    while (inFlightSaveRef.current) {
      const pending = inFlightSaveRef.current
      try {
        await pending
      } catch {
        // The caller below decides whether a failed state may be retried.
      }
      if (inFlightSaveRef.current === pending) inFlightSaveRef.current = null
    }

    const task = performSaveOnce()
    inFlightSaveRef.current = task
    try {
      return await task
    } finally {
      if (inFlightSaveRef.current === task) inFlightSaveRef.current = null
    }
  }, [performSaveOnce])

  const flushAutosave = useCallback(async () => {
    clearAutosaveTimer()
    if (!canWrite || !draftRef.current?.document) return draftRef.current

    if (autosaveStatusRef.current === 'error' || autosaveStatusRef.current === 'conflict') {
      throw autosaveFailureRef.current || new Error(AUTOSAVE_FAILURE_MESSAGE)
    }

    while (
      draftRef.current?.document &&
      !sameDocument(draftRef.current.document, lastSavedDocumentRef.current)
    ) {
      await persistCurrentOnce()
      if (autosaveStatusRef.current === 'error' || autosaveStatusRef.current === 'conflict') {
        throw autosaveFailureRef.current || new Error(AUTOSAVE_FAILURE_MESSAGE)
      }
    }

    if (autosaveStatusRef.current === 'dirty') {
      setAutosaveStatus('saved')
      setAutosaveError(null)
      autosaveFailureRef.current = null
    }

    return draftRef.current
  }, [canWrite, clearAutosaveTimer, persistCurrentOnce, setAutosaveStatus])

  const retryAutosave = useCallback(async () => {
    if (!canWrite || !draftRef.current?.document) return draftRef.current
    setAutosaveError(null)
    setError(null)
    autosaveFailureRef.current = null
    setAutosaveStatus('dirty')
    return flushAutosave()
  }, [canWrite, flushAutosave, setAutosaveStatus])

  useEffect(() => {
    clearAutosaveTimer()
    if (!canWrite || autosaveStatusState !== 'dirty' || !draft?.id || !draft.document) {
      return undefined
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null
      persistCurrentOnce().catch(() => {})
    }, AUTOSAVE_DELAY_MS)

    return clearAutosaveTimer
  }, [autosaveStatusState, canWrite, clearAutosaveTimer, draft, persistCurrentOnce])

  useEffect(() => {
    return () => {
      clearAutosaveTimer()
      if (
        canWrite &&
        autosaveStatusRef.current === 'dirty' &&
        draftRef.current?.document &&
        !sameDocument(draftRef.current.document, lastSavedDocumentRef.current)
      ) {
        // A route change may unmount this workspace before the one-second debounce expires.
        // Start the serialized save during cleanup so navigation cannot silently drop the edit.
        persistCurrentOnce().catch(() => {})
      }
    }
  }, [canWrite, clearAutosaveTimer, persistCurrentOnce])

  const activateDraftVersion = useCallback(() => {
    return withWrite(async () => {
      const savedDraft = await flushAutosave()
      if (!savedDraft?.id) throw new Error('No hay borrador para activar.')
      if (!Number.isInteger(savedDraft.revision)) {
        throw new Error('El borrador no tiene una revisión válida para activar.')
      }

      const data = await requestJson(
        `/api/admin/ai/guidelines/drafts/${encodeURIComponent(savedDraft.id)}/activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: savedDraft.revision }),
        },
        'No se pudo activar el borrador.'
      )

      if (data?.active) setActive(data.active)
      if (data?.auditLog) setAuditLog(data.auditLog)
      adoptServerDraft(null)
      setViewModeValue('active')

      // Activation already succeeded; a follow-up refresh failure must not restore the draft or
      // make the operation look as if activation itself failed.
      try {
        await refresh({ preserveLocal: false, preferredView: 'active' })
      } catch {
        // `refresh` exposes a recoverable error and keeps the activated document above.
      }
      return data
    })
  }, [adoptServerDraft, flushAutosave, refresh, setViewModeValue, withWrite])

  const discardDraft = useCallback(() => {
    return withWrite(async () => {
      clearAutosaveTimer()
      if (inFlightSaveRef.current) {
        try {
          await inFlightSaveRef.current
        } catch {
          // Discard is explicit and may proceed even if the pending save failed.
        }
      }

      const current = draftRef.current
      if (!current?.id) throw new Error('No hay borrador para descartar.')
      const data = await requestJson(
        `/api/admin/ai/guidelines/drafts/${encodeURIComponent(current.id)}`,
        { method: 'DELETE' },
        'No se pudo descartar el borrador.'
      )
      if (data?.auditLog) setAuditLog(data.auditLog)
      adoptServerDraft(null)
      setViewModeValue('active')
      return data
    })
  }, [adoptServerDraft, clearAutosaveTimer, setViewModeValue, withWrite])

  const rollbackVersion = useCallback(
    (version) => {
      return withWrite(async () => {
        const data = await requestJson(
          `/api/admin/ai/guidelines/${encodeURIComponent(version)}/rollback`,
          { method: 'POST' },
          'No se pudo restaurar la versión.'
        )
        if (data?.active) setActive(data.active)
        if (data?.auditLog) setAuditLog(data.auditLog)
        try {
          await refresh({ preserveLocal: true })
        } catch {
          // The rollback response already contains the new active document.
        }
        return data
      })
    },
    [refresh, withWrite]
  )

  const setViewMode = useCallback(
    (nextMode) => {
      if (nextMode !== 'active' && nextMode !== 'draft') return false
      if (nextMode === 'draft' && !draftRef.current) return false
      setViewModeValue(nextMode)
      return true
    },
    [setViewModeValue]
  )

  const viewMode = viewModeState === 'draft' && !draft ? 'active' : viewModeState
  const displayDoc = viewMode === 'draft' ? draft?.document || active : active
  const isEditing = viewMode === 'draft' && Boolean(draft)
  const autosaveStatus = autosaveStatusState
  const loading = operationLoading || autosaveStatus === 'saving'

  return {
    hydrated,
    loading,
    refreshing,
    operationLoading,
    error,
    active,
    draft,
    viewMode,
    setViewMode,
    displayDoc,
    isEditing,
    versions,
    auditLog,
    autosaveStatus,
    autosaveError,
    createDraftFromActive,
    updateDraft,
    saveDraft: flushAutosave,
    flushAutosave,
    retryAutosave,
    activateDraftVersion,
    discardDraft,
    rollbackVersion,
    refresh,
    retryRefresh: refresh,
  }
}
