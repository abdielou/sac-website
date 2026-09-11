'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AI_RUN_MODES, useAiRunCoordinator } from '@/lib/hooks/AiRunProvider'

const URL_RETRY_MS = 2000

function runUrl(mode, runId, currentSearchParams) {
  const params = new URLSearchParams(currentSearchParams)
  if (mode === AI_RUN_MODES.GENERATE) {
    params.set('tab', 'generar')
  } else {
    params.delete('tab')
  }

  if (runId) params.set('runId', runId)
  else params.delete('runId')
  const query = params.toString()
  return query ? `/admin/ai?${query}` : '/admin/ai'
}

/** Bridges one AI tab to the layout-owned coordinator without owning its requests. */
export function useAiRunUrl(mode) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const urlRunId = searchParams.get('runId')
  const coordinator = useAiRunCoordinator()
  const { slot, adoptUrlRun } = coordinator
  const ignoredRunIdRef = useRef(null)

  const replaceRunId = useCallback(
    (runId) => {
      router.replace(runUrl(mode, runId, searchString), { scroll: false })
    },
    [mode, router, searchString]
  )

  // A URL run wins only after the server confirms ownership/existence. Two 404s
  // are required by the provider; transient failures leave the URL untouched.
  useEffect(() => {
    if (!slot.hydrated) return undefined
    if (!urlRunId) {
      ignoredRunIdRef.current = null
      return undefined
    }
    if (ignoredRunIdRef.current === urlRunId) return undefined
    if (slot.mode === mode && slot.runId === urlRunId) return undefined

    let cancelled = false
    let timer = null
    const inspect = async () => {
      const outcome = await adoptUrlRun(mode, urlRunId)
      if (cancelled) return
      if (outcome.status === 'retry') {
        timer = window.setTimeout(inspect, URL_RETRY_MS)
      } else if (outcome.status === 'not-found') {
        ignoredRunIdRef.current = urlRunId
        replaceRunId(null)
      }
    }
    inspect()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [adoptUrlRun, mode, replaceRunId, slot.hydrated, slot.mode, slot.runId, urlRunId])

  // Returning to the matching tab silently restores the locally recoverable run.
  useEffect(() => {
    if (urlRunId || !slot.hydrated || slot.mode !== mode || !slot.runId) return
    replaceRunId(slot.runId)
  }, [mode, replaceRunId, slot.hydrated, slot.mode, slot.runId, urlRunId])

  const leaveCurrentUrl = useCallback(() => {
    if (urlRunId) ignoredRunIdRef.current = urlRunId
    replaceRunId(null)
  }, [replaceRunId, urlRunId])

  return { ...coordinator, urlRunId, leaveCurrentUrl }
}
