'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDefaultGuidelines } from '@/lib/ai-guidelines'
import {
  STORAGE_KEYS,
  activateDraft,
  cloneGuidelines,
  createAuditEvent,
  createGuidelineDocument,
  normalizeGuidelineDocument,
  parseStoredJson,
  prependAuditEvent,
} from '@/lib/ai-guidelines-draft'

function readActiveFromStorage() {
  if (typeof window === 'undefined') return null
  return normalizeGuidelineDocument(parseStoredJson(localStorage.getItem(STORAGE_KEYS.active), null))
}

function readDraftFromStorage() {
  if (typeof window === 'undefined') return null
  return normalizeGuidelineDocument(parseStoredJson(localStorage.getItem(STORAGE_KEYS.draft), null))
}

function readAuditFromStorage() {
  if (typeof window === 'undefined') return []
  return parseStoredJson(localStorage.getItem(STORAGE_KEYS.audit), [])
}

function seedActiveIfMissing() {
  const existing = readActiveFromStorage()
  if (existing) {
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(existing))
    return existing
  }
  const seeded = createGuidelineDocument({ seed: getDefaultGuidelines() })
  localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(seeded))
  return seeded
}

/**
 * Client-side guidelines draft/active state (localStorage). Workflows still use server stub.
 */
export function useGuidelinesDraft({ canWrite, userName }) {
  const [active, setActive] = useState(null)
  const [draft, setDraft] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const seededActive = seedActiveIfMissing()
    setActive(seededActive)
    setDraft(readDraftFromStorage())
    setAuditLog(readAuditFromStorage())
    setHydrated(true)
  }, [])

  const persistActive = useCallback((doc) => {
    const normalized = normalizeGuidelineDocument(doc)
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(normalized))
    setActive(normalized)
  }, [])

  const persistDraft = useCallback((doc) => {
    if (doc) {
      const normalized = normalizeGuidelineDocument(doc)
      localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(normalized))
      setDraft(normalized)
    } else {
      localStorage.removeItem(STORAGE_KEYS.draft)
      setDraft(null)
    }
  }, [])

  const persistAudit = useCallback((events) => {
    localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify(events))
    setAuditLog(events)
  }, [])

  const createDraftFromActive = useCallback(() => {
    if (!canWrite || !active) return
    const newDraft = cloneGuidelines(active)
    persistDraft(newDraft)
    const event = createAuditEvent({
      action: 'created_draft',
      version: newDraft.version,
      by: userName || 'Usuario',
      detail: `Borrador creado desde ${active.version}`,
    })
    persistAudit(prependAuditEvent(readAuditFromStorage(), event))
  }, [active, canWrite, persistAudit, persistDraft, userName])

  const updateDraft = useCallback(
    (patch) => {
      if (!draft) return
      setDraft((prev) => {
        const next = normalizeGuidelineDocument({ ...prev, ...patch })
        localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(next))
        return next
      })
    },
    [draft]
  )

  const saveDraft = useCallback(() => {
    if (!canWrite || !draft) return
    persistDraft(draft)
    const event = createAuditEvent({
      action: 'saved',
      version: draft.version,
      by: userName || 'Usuario',
      detail: 'Borrador guardado',
    })
    persistAudit(prependAuditEvent(readAuditFromStorage(), event))
  }, [canWrite, draft, persistAudit, persistDraft, userName])

  const activateDraftVersion = useCallback(() => {
    if (!canWrite || !draft) return
    const { active: nextActive, auditEvent } = activateDraft(draft, userName || 'Usuario')
    persistActive(nextActive)
    persistDraft(null)
    persistAudit(prependAuditEvent(readAuditFromStorage(), auditEvent))
  }, [canWrite, draft, persistActive, persistAudit, persistDraft, userName])

  const discardDraft = useCallback(() => {
    if (!canWrite) return
    persistDraft(null)
  }, [canWrite, persistDraft])

  const displayDoc = draft || active
  const isEditing = Boolean(draft)

  return {
    hydrated,
    active,
    draft,
    displayDoc,
    isEditing,
    auditLog,
    createDraftFromActive,
    updateDraft,
    saveDraft,
    activateDraftVersion,
    discardDraft,
  }
}
