'use client'

import React, { createContext, useContext, useMemo, useState } from 'react'
import { DEFAULT_GENERATION_FORM } from '@/lib/social-template/buildGenerationPayload'

const GenerationDraftContext = createContext(null)

/** Keeps the generator form mounted above the query-driven AI tabs. */
export function GenerationDraftProvider({ children }) {
  const [formState, setFormState] = useState(() => ({
    ...DEFAULT_GENERATION_FORM,
    // The active Guidelines catalog selects the initial type after hydration.
    contentType: '',
  }))
  const value = useMemo(() => ({ formState, setFormState }), [formState])

  return <GenerationDraftContext.Provider value={value}>{children}</GenerationDraftContext.Provider>
}

export function useGenerationDraft() {
  const value = useContext(GenerationDraftContext)
  if (!value) {
    throw new Error('useGenerationDraft debe usarse dentro de GenerationDraftProvider')
  }
  return value
}
