'use client'

import { useEffect, useState } from 'react'
import { getDefaultGuidelines } from '@/lib/ai-guidelines'
import {
  STORAGE_KEYS,
  createGuidelineDocument,
  normalizeGuidelineDocument,
  parseStoredJson,
} from '@/lib/ai-guidelines-draft'

function readOrSeedActive() {
  if (typeof window === 'undefined') return null
  const existing = normalizeGuidelineDocument(
    parseStoredJson(localStorage.getItem(STORAGE_KEYS.active), null)
  )
  if (existing) {
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(existing))
    return existing
  }
  const seeded = createGuidelineDocument({ seed: getDefaultGuidelines() })
  localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(seeded))
  return seeded
}

/**
 * Read-only active guidelines from localStorage (shared with Guidelines draft flow).
 */
export function useActiveGuidelines() {
  const [active, setActive] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setActive(readOrSeedActive())
    setHydrated(true)
  }, [])

  return { active, hydrated }
}
