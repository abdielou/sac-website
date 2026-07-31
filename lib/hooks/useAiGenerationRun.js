'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildGenerationPayload } from '@/lib/social-template/buildGenerationPayload'

export { buildGenerationPayload }

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000
const MAX_POLL_RETRY_MS = 10000

/**
 * Hook for the generation workflow: submit, poll, URL runId recovery.
 * Mirrors useAiValidationRun but posts JSON to /api/admin/ai/generate
 * and keeps tab=generar in the URL.
 */
export function useAiGenerationRun({ canGenerate }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlRunId = searchParams.get('runId')

  const [phase, setPhase] = useState('idle')
  const [runId, setRunId] = useState(null)
  const [result, setResult] = useState(null)
  const [usage, setUsage] = useState(null)
  const [guidelineVersion, setGuidelineVersion] = useState(null)
  const [error, setError] = useState(null)

  const applyCompletedPayload = useCallback((payload) => {
    const isWrapped =
      payload &&
      typeof payload === 'object' &&
      payload.result &&
      typeof payload.result === 'object' &&
      Array.isArray(payload.result.drafts)

    if (isWrapped) {
      setResult(payload.result)
      setUsage(payload.usage ?? null)
      setGuidelineVersion(payload.guidelineVersion ?? null)
    } else {
      setResult(payload)
      setUsage(null)
      setGuidelineVersion(null)
    }
  }, [])

  const pollTimerRef = useRef(null)
  const pollStartedRef = useRef(null)
  const abortRef = useRef(false)
  const pollFailuresRef = useRef(0)

  const setRunIdInUrl = useCallback(
    (id) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'generar')
      if (id) {
        params.set('runId', id)
      } else {
        params.delete('runId')
      }
      router.replace(`/admin/ai?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollRun = useCallback(
    async (id) => {
      if (abortRef.current) return

      const elapsed = Date.now() - (pollStartedRef.current || Date.now())
      if (elapsed > POLL_TIMEOUT_MS) {
        setPhase('timeout')
        setError('La generación sigue en proceso. Consulta de nuevo o refresca esta página.')
        clearPolling()
        return
      }

      try {
        const res = await fetch(`/api/admin/ai/runs/${encodeURIComponent(id)}`)
        if (res.status === 401 && typeof window !== 'undefined') {
          window.location.href = '/auth/signin'
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const requestError = new Error(body.error || 'Error al consultar el estado')
          requestError.transient = res.status === 429 || res.status >= 500
          throw requestError
        }

        const data = await res.json()
        pollFailuresRef.current = 0

        if (data.status === 'completed') {
          applyCompletedPayload(data.result)
          setPhase('completed')
          setError(null)
          clearPolling()
          return
        }

        if (data.status === 'failed') {
          setPhase('failed')
          setError(data.error || 'La generación falló')
          setResult(null)
          setUsage(null)
          setGuidelineVersion(null)
          clearPolling()
          return
        }

        if (data.status === 'cancelled') {
          setPhase('failed')
          setError('La generación fue cancelada')
          clearPolling()
          return
        }

        pollTimerRef.current = setTimeout(() => pollRun(id), POLL_INTERVAL_MS)
      } catch (err) {
        if (err?.transient === false) {
          setPhase('failed')
          setError(err.message || 'No se pudo consultar la ejecución')
          clearPolling()
          return
        }

        pollFailuresRef.current += 1
        const retryDelay = Math.min(
          POLL_INTERVAL_MS * 2 ** Math.min(pollFailuresRef.current, 3),
          MAX_POLL_RETRY_MS
        )
        pollTimerRef.current = setTimeout(() => pollRun(id), retryDelay)
      }
    },
    [applyCompletedPayload, clearPolling]
  )

  const startPolling = useCallback(
    (id) => {
      clearPolling()
      abortRef.current = false
      pollFailuresRef.current = 0
      pollStartedRef.current = Date.now()
      setRunId(id)
      setPhase('polling')
      setResult(null)
      setUsage(null)
      setGuidelineVersion(null)
      setError(null)
      pollRun(id)
    },
    [clearPolling, pollRun]
  )

  const submitGeneration = useCallback(
    async (formState) => {
      if (!canGenerate) return

      setPhase('submitting')
      setError(null)
      setResult(null)
      setUsage(null)
      setGuidelineVersion(null)

      try {
        const res = await fetch('/api/admin/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildGenerationPayload(formState)),
        })

        if (res.status === 401 && typeof window !== 'undefined') {
          window.location.href = '/auth/signin'
          return
        }

        const body = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(body.details || body.error || 'No se pudo iniciar la generación')
        }

        const newRunId = body.runId
        if (!newRunId) {
          throw new Error('Respuesta sin runId')
        }

        setRunIdInUrl(newRunId)
        startPolling(newRunId)
      } catch (err) {
        setPhase('failed')
        setError(err.message || 'Error al enviar')
      }
    },
    [canGenerate, setRunIdInUrl, startPolling]
  )

  const resetRun = useCallback(() => {
    abortRef.current = true
    clearPolling()
    setRunId(null)
    setResult(null)
    setUsage(null)
    setGuidelineVersion(null)
    setError(null)
    setPhase('idle')
    setRunIdInUrl(null)
  }, [clearPolling, setRunIdInUrl])

  const retryRun = useCallback(() => {
    if (runId) startPolling(runId)
  }, [runId, startPolling])

  // Resume polling from URL on mount / refresh (API enforces auth + ownership)
  useEffect(() => {
    if (!urlRunId || phase !== 'idle') return
    startPolling(urlRunId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRunId])

  useEffect(
    () => () => {
      abortRef.current = true
      clearPolling()
    },
    [clearPolling]
  )

  const isBusy = phase === 'submitting' || phase === 'polling'

  return {
    phase,
    runId,
    result,
    usage,
    guidelineVersion,
    error,
    isBusy,
    submitGeneration,
    retryRun,
    resetRun,
  }
}
