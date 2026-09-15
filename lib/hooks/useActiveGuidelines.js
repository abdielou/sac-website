'use client'

import { useEffect, useState } from 'react'
import { getDefaultGuidelines } from '@/lib/ai-guidelines'
import { normalizeGuidelineDocument } from '@/lib/ai-guidelines-draft'

/**
 * Read-only active guidelines from the server guidelines API.
 * Falls back to MVP defaults if the request fails.
 */
export function useActiveGuidelines() {
  const [active, setActive] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/ai/guidelines')
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (!cancelled) {
          setActive(normalizeGuidelineDocument(data.active) || getDefaultGuidelines())
        }
      } catch {
        if (!cancelled) setActive(getDefaultGuidelines())
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { active, hydrated }
}
