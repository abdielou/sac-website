'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_FORM,
  clearValidationDraft,
  getValidationDraftUserIdentity,
  mergeFormState,
  readValidationDraft,
  resolveValidationDraftOwnerKey,
  writeValidationDraft,
} from '@/lib/ai-validation-draft'
import { validateImageFiles } from '@/lib/ai-validation-images'

const PERSIST_DEBOUNCE_MS = 300
const EMPTY_IMAGES = Object.freeze([])

function draftFingerprint(formState, images) {
  return JSON.stringify({
    formState: mergeFormState(formState),
    images: (images || []).map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    })),
  })
}

/**
 * Persist Validar fields and images locally per authenticated user. The hook blanks
 * its public state immediately when identity changes, before the next user's draft
 * is loaded, so one account can never see another account's restored values.
 */
export function useValidationDraft({ user, enabled = true } = {}) {
  const userId = typeof user?.id === 'string' ? user.id : ''
  const userEmail = typeof user?.email === 'string' ? user.email : ''
  const identity = enabled ? getValidationDraftUserIdentity(user) : null
  const [storedFormState, setStoredFormState] = useState(DEFAULT_FORM)
  const [storedImages, setStoredImages] = useState([])
  const [activeIdentity, setActiveIdentity] = useState(null)
  const [ownerKey, setOwnerKey] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState('loading')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [restoreNotice, setRestoreNotice] = useState(null)
  const hydrationGenerationRef = useRef(0)
  const persistGenerationRef = useRef(0)
  const persistedFingerprintRef = useRef(draftFingerprint(DEFAULT_FORM, []))
  const latestDraftRef = useRef({
    formState: DEFAULT_FORM,
    images: EMPTY_IMAGES,
    fingerprint: draftFingerprint(DEFAULT_FORM, []),
  })

  const ownsVisibleState = Boolean(identity && identity === activeIdentity)
  const formState = ownsVisibleState ? storedFormState : DEFAULT_FORM
  const images = ownsVisibleState ? storedImages : EMPTY_IMAGES
  const isHydrated = ownsVisibleState && hydrated

  useEffect(() => {
    latestDraftRef.current = {
      formState: storedFormState,
      images: storedImages,
      fingerprint: draftFingerprint(storedFormState, storedImages),
    }
  }, [storedFormState, storedImages])

  useEffect(() => {
    const generation = ++hydrationGenerationRef.current
    ++persistGenerationRef.current
    let cancelled = false

    // Public values are already blank during render because the identities differ.
    setActiveIdentity(null)
    setOwnerKey(null)
    setStoredFormState(DEFAULT_FORM)
    setStoredImages([])
    setHydrated(false)
    setUpdatedAt(null)
    setRestoreNotice(null)
    setSaveStatus(identity ? 'loading' : 'unavailable')
    persistedFingerprintRef.current = draftFingerprint(DEFAULT_FORM, [])

    if (!identity) {
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      const nextOwnerKey = await resolveValidationDraftOwnerKey({ id: userId, email: userEmail })
      if (cancelled || hydrationGenerationRef.current !== generation) return

      if (!nextOwnerKey) {
        setActiveIdentity(identity)
        setHydrated(true)
        setSaveStatus('unavailable')
        return
      }

      const draft = await readValidationDraft(nextOwnerKey)
      if (cancelled || hydrationGenerationRef.current !== generation) return

      if (draft === undefined) {
        setActiveIdentity(identity)
        setHydrated(true)
        setSaveStatus('unavailable')
        return
      }

      const nextFormState = draft ? mergeFormState(draft.formState) : { ...DEFAULT_FORM }
      const nextImages = draft?.images || []
      setStoredFormState(nextFormState)
      setStoredImages(nextImages)
      setActiveIdentity(identity)
      setOwnerKey(nextOwnerKey)
      setHydrated(true)
      setUpdatedAt(draft?.updatedAt || null)
      setRestoreNotice(
        draft?.repaired ? 'Se omitieron datos del borrador local que ya no eran válidos.' : null
      )
      persistedFingerprintRef.current = draftFingerprint(nextFormState, nextImages)
      setSaveStatus(draft ? 'saved' : 'empty')

      if (draft?.repaired) {
        setSaveStatus('saving')
        const repaired = await writeValidationDraft(nextOwnerKey, {
          formState: nextFormState,
          images: nextImages,
        })
        if (cancelled || hydrationGenerationRef.current !== generation) return
        if (repaired) {
          setUpdatedAt(repaired.updatedAt)
          setSaveStatus('saved')
        } else {
          setSaveStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [identity, userEmail, userId])

  const setFormState = useCallback(
    (value) => {
      if (!isHydrated) return
      setStoredFormState((current) => {
        const next = typeof value === 'function' ? value(current) : value
        return mergeFormState(next)
      })
      setSaveStatus('dirty')
    },
    [isHydrated]
  )

  const setImages = useCallback(
    (value) => {
      if (!isHydrated) return
      setStoredImages((current) => {
        const next = typeof value === 'function' ? value(current) : value
        return Array.isArray(next) && !validateImageFiles(next) ? next : current
      })
      setSaveStatus('dirty')
    },
    [isHydrated]
  )

  useEffect(() => {
    if (!isHydrated || !ownerKey) return undefined

    const fingerprint = draftFingerprint(storedFormState, storedImages)
    if (fingerprint === persistedFingerprintRef.current) return undefined

    const generation = ++persistGenerationRef.current
    setSaveStatus('dirty')
    const snapshot = {
      formState: storedFormState,
      images: storedImages,
    }
    const timer = setTimeout(async () => {
      if (persistGenerationRef.current !== generation) return
      setSaveStatus('saving')
      const saved = await writeValidationDraft(ownerKey, snapshot)
      if (persistGenerationRef.current !== generation) return
      if (saved) {
        persistedFingerprintRef.current = fingerprint
        setUpdatedAt(saved.updatedAt)
        setSaveStatus('saved')
      } else {
        setSaveStatus('error')
      }
    }, PERSIST_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [isHydrated, ownerKey, storedFormState, storedImages])

  useEffect(() => {
    if (!isHydrated || !ownerKey) return undefined
    const scopedOwnerKey = ownerKey

    return () => {
      const latest = latestDraftRef.current
      if (latest.fingerprint === persistedFingerprintRef.current) return
      // Flush the last debounced edit when leaving the page or changing account.
      void writeValidationDraft(scopedOwnerKey, {
        formState: latest.formState,
        images: latest.images,
      })
    }
  }, [isHydrated, ownerKey])

  const clearDraft = useCallback(async () => {
    if (!isHydrated) return false
    const generation = ++persistGenerationRef.current
    const emptyForm = { ...DEFAULT_FORM }
    setStoredFormState(emptyForm)
    setStoredImages([])
    setRestoreNotice(null)
    setUpdatedAt(null)
    persistedFingerprintRef.current = draftFingerprint(emptyForm, [])
    if (!ownerKey) {
      setSaveStatus('unavailable')
      return true
    }
    setSaveStatus('saving')

    const cleared = await clearValidationDraft(ownerKey)
    if (persistGenerationRef.current === generation) {
      setSaveStatus(cleared ? 'empty' : 'error')
    }
    return cleared
  }, [isHydrated, ownerKey])

  return useMemo(
    () => ({
      formState,
      setFormState,
      images,
      setImages,
      hydrated: isHydrated,
      clearDraft,
      saveStatus: identity ? saveStatus : 'unavailable',
      updatedAt,
      restoreNotice,
    }),
    [
      clearDraft,
      formState,
      identity,
      images,
      isHydrated,
      restoreNotice,
      saveStatus,
      setFormState,
      setImages,
      updatedAt,
    ]
  )
}
