'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_FORM,
  clearValidationDraft,
  draftImageToFile,
  mergeFormState,
  readValidationDraft,
  writeValidationDraft,
} from '@/lib/ai-validation-draft'

const PERSIST_DEBOUNCE_MS = 300

/**
 * Persist Validar form fields + images across refresh (IndexedDB).
 */
export function useValidationDraft() {
  const [formState, setFormState] = useState(DEFAULT_FORM)
  const [images, setImages] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const persistGenRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const draft = await readValidationDraft()
      if (cancelled) return

      if (draft) {
        setFormState(mergeFormState(draft.formState))
        setImages((draft.images || []).map(draftImageToFile))
      }
      setHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return undefined

    const gen = ++persistGenRef.current
    const timer = setTimeout(() => {
      if (persistGenRef.current !== gen) return
      writeValidationDraft({ formState, images })
    }, PERSIST_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [formState, images, hydrated])

  const clearDraft = useCallback(async () => {
    setFormState(DEFAULT_FORM)
    setImages([])
    await clearValidationDraft()
  }, [])

  return {
    formState,
    setFormState,
    images,
    setImages,
    hydrated,
    clearDraft,
  }
}
