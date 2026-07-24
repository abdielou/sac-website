'use client'

import { useCallback, useEffect, useState } from 'react'

async function readErrorMessage(res, fallback) {
  try {
    const data = await res.json()
    return data?.error || data?.details || fallback
  } catch {
    return fallback
  }
}

/**
 * Server-backed guidelines draft/active state (S3 via admin AI APIs).
 */
export function useGuidelinesDraft({ canWrite }) {
  const [active, setActive] = useState(null)
  const [draft, setDraft] = useState(null)
  const [versions, setVersions] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const applyWorkspace = useCallback((workspace) => {
    setActive(workspace.active || null)
    setDraft(workspace.draft || null)
    setVersions(workspace.versions || [])
    setAuditLog(workspace.auditLog || [])
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/admin/ai/guidelines')
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'No se pudieron cargar las guías.'))
    }
    const workspace = await res.json()
    applyWorkspace(workspace)
    return workspace
  }, [applyWorkspace])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refresh()
      } catch (err) {
        if (!cancelled) setError(err.message || 'Error al cargar guías')
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const withWrite = useCallback(
    async (fn) => {
      if (!canWrite || loading) return
      setLoading(true)
      setError(null)
      try {
        await fn()
      } catch (err) {
        setError(err.message || 'Operación fallida')
      } finally {
        setLoading(false)
      }
    },
    [canWrite, loading]
  )

  const createDraftFromActive = useCallback(() => {
    return withWrite(async () => {
      const res = await fetch('/api/admin/ai/guidelines/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'No se pudo crear el borrador.'))
      }
      const data = await res.json()
      setDraft(data.draft)
      if (data.auditLog) setAuditLog(data.auditLog)
      await refresh()
    })
  }, [refresh, withWrite])

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => {
      if (!prev?.document) return prev
      return {
        ...prev,
        document: {
          ...prev.document,
          ...patch,
        },
      }
    })
  }, [])

  const saveDraft = useCallback(() => {
    return withWrite(async () => {
      if (!draft?.id || !draft.document) return
      const res = await fetch(`/api/admin/ai/guidelines/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: draft.document }),
      })
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'No se pudo guardar el borrador.'))
      }
      const data = await res.json()
      setDraft(data.draft)
      if (data.auditLog) setAuditLog(data.auditLog)
    })
  }, [draft, withWrite])

  const activateDraftVersion = useCallback(() => {
    return withWrite(async () => {
      if (!draft?.id) {
        throw new Error('No hay borrador para activar.')
      }
      // Persist latest local edits before activation.
      const saveRes = await fetch(
        `/api/admin/ai/guidelines/drafts/${encodeURIComponent(draft.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document: draft.document }),
        }
      )
      if (!saveRes.ok) {
        throw new Error(await readErrorMessage(saveRes, 'No se pudo guardar antes de activar.'))
      }

      const res = await fetch(
        `/api/admin/ai/guidelines/drafts/${encodeURIComponent(draft.id)}/activate`,
        { method: 'POST' }
      )
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'No se pudo activar el borrador.'))
      }
      await refresh()
    })
  }, [draft, refresh, withWrite])

  const discardDraft = useCallback(() => {
    return withWrite(async () => {
      if (!draft?.id) {
        throw new Error('No hay borrador para descartar.')
      }
      const res = await fetch(`/api/admin/ai/guidelines/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'No se pudo descartar el borrador.'))
      }
      await refresh()
    })
  }, [draft, refresh, withWrite])

  const rollbackVersion = useCallback(
    (version) => {
      return withWrite(async () => {
        const res = await fetch(
          `/api/admin/ai/guidelines/${encodeURIComponent(version)}/rollback`,
          { method: 'POST' }
        )
        if (!res.ok) {
          throw new Error(await readErrorMessage(res, 'No se pudo restaurar la versión.'))
        }
        await refresh()
      })
    },
    [refresh, withWrite]
  )

  const displayDoc = draft?.document || active
  const isEditing = Boolean(draft)

  return {
    hydrated,
    loading,
    error,
    active,
    draft,
    displayDoc,
    isEditing,
    versions,
    auditLog,
    createDraftFromActive,
    updateDraft,
    saveDraft,
    activateDraftVersion,
    discardDraft,
    rollbackVersion,
    refresh,
  }
}
