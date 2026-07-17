'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 120000

function splitList(value, separator = ',') {
  if (!value || !String(value).trim()) return undefined
  const list = String(value)
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

function buildEventDetails(formState) {
  if (formState.contentType !== 'event_promotion') return undefined
  const details = {}
  if (formState.eventName?.trim()) details.name = formState.eventName.trim()
  if (formState.eventDate?.trim()) details.date = formState.eventDate.trim()
  if (formState.eventTime?.trim()) details.time = formState.eventTime.trim()
  if (formState.eventLocation?.trim()) details.location = formState.eventLocation.trim()
  return Object.keys(details).length ? details : undefined
}

export function buildGenerationPayload(formState) {
  return {
    intent: formState.intent.trim(),
    topic: formState.topic.trim(),
    platforms: formState.platforms,
    contentType: formState.contentType,
    tone: formState.tone?.trim() || undefined,
    audience: formState.audience?.trim() || undefined,
    cta: formState.cta?.trim() || undefined,
    knownFacts: splitList(formState.knownFacts, '\n'),
    hashtags: splitList(formState.hashtags),
    links: splitList(formState.links),
    eventDetails: buildEventDetails(formState),
    imageStyle: formState.imageStyle?.trim() || undefined,
    imageConstraints: formState.imageConstraints?.trim() || undefined,
  }
}

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
  const [copyFeedback, setCopyFeedback] = useState(null)

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
        setError('La generación tardó demasiado. Puedes reintentar o refrescar más tarde.')
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
          throw new Error(body.error || 'Error al consultar el estado')
        }

        const data = await res.json()

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
        setPhase('failed')
        setError(err.message || 'Error de conexión')
        clearPolling()
      }
    },
    [applyCompletedPayload, clearPolling]
  )

  const startPolling = useCallback(
    (id) => {
      clearPolling()
      abortRef.current = false
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

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback('Copiado')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [])

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
    copyFeedback,
    submitGeneration,
    resetRun,
    showCopyFeedback,
  }
}
