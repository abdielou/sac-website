'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { contentTypeAcceptsImages } from '@/lib/ai-constants'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 90000

function parseHashtags(value) {
  if (!value || !String(value).trim()) return undefined
  const list = String(value)
    .split(',')
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

function buildFormData(formState, images) {
  const fd = new FormData()
  fd.set('platform', formState.platform)
  fd.set('contentType', formState.contentType)
  fd.set('draftText', formState.draftText)
  if (formState.goal?.trim()) fd.set('goal', formState.goal.trim())
  if (formState.audience?.trim()) fd.set('audience', formState.audience.trim())
  if (formState.cta?.trim()) fd.set('cta', formState.cta.trim())
  if (formState.altText?.trim()) fd.set('altText', formState.altText.trim())

  const hashtags = parseHashtags(formState.hashtags)
  if (hashtags) fd.set('hashtags', JSON.stringify(hashtags))

  const eventDetails = buildEventDetails(formState)
  if (eventDetails) fd.set('eventDetails', JSON.stringify(eventDetails))

  if (contentTypeAcceptsImages(formState.platform, formState.contentType)) {
    for (const file of images) {
      fd.append('images', file)
    }
  }

  return fd
}

/**
 * @typedef {'idle' | 'submitting' | 'polling' | 'completed' | 'failed' | 'timeout'} RunPhase
 */

/**
 * Hook for validation workflow: submit, poll, URL runId recovery.
 */
export function useAiValidationRun({ canValidate }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlRunId = searchParams.get('runId')

  const [phase, setPhase] = useState('idle')
  const [runId, setRunId] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState(null)

  const pollTimerRef = useRef(null)
  const pollStartedRef = useRef(null)
  const abortRef = useRef(false)

  const setRunIdInUrl = useCallback(
    (id) => {
      const params = new URLSearchParams(searchParams.toString())
      // Validar is the default tab — keep URL clean unless another tab was set.
      params.delete('tab')
      if (id) {
        params.set('runId', id)
      } else {
        params.delete('runId')
      }
      const qs = params.toString()
      router.replace(qs ? `/admin/ai?${qs}` : '/admin/ai', { scroll: false })
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
        setError('La validación tardó demasiado. Puedes reintentar o refrescar más tarde.')
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
          setResult(data.result)
          setPhase('completed')
          setError(null)
          clearPolling()
          return
        }

        if (data.status === 'failed') {
          setPhase('failed')
          setError(data.error || 'La validación falló')
          setResult(null)
          clearPolling()
          return
        }

        if (data.status === 'cancelled') {
          setPhase('failed')
          setError('La validación fue cancelada')
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
    [clearPolling]
  )

  const startPolling = useCallback(
    (id) => {
      clearPolling()
      abortRef.current = false
      pollStartedRef.current = Date.now()
      setRunId(id)
      setPhase('polling')
      setResult(null)
      setError(null)
      pollRun(id)
    },
    [clearPolling, pollRun]
  )

  const submitValidation = useCallback(
    async (formState, images) => {
      if (!canValidate) return

      setPhase('submitting')
      setError(null)
      setResult(null)

      try {
        const fd = buildFormData(formState, images)
        const res = await fetch('/api/admin/ai/validate', {
          method: 'POST',
          body: fd,
        })

        if (res.status === 401 && typeof window !== 'undefined') {
          window.location.href = '/auth/signin'
          return
        }

        const body = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(body.details || body.error || 'No se pudo iniciar la validación')
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
    [canValidate, setRunIdInUrl, startPolling]
  )

  const resetRun = useCallback(() => {
    abortRef.current = true
    clearPolling()
    setRunId(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setRunIdInUrl(null)
  }, [clearPolling, setRunIdInUrl])

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback('Copiado')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [])

  // Resume polling from URL on mount / refresh
  useEffect(() => {
    if (!urlRunId || phase !== 'idle') return
    if (!canValidate && urlRunId) {
      // read-only users may still view if they own the run — API enforces ownership
      startPolling(urlRunId)
      return
    }
    if (canValidate) {
      startPolling(urlRunId)
    }
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
    error,
    isBusy,
    copyFeedback,
    submitValidation,
    resetRun,
    showCopyFeedback,
  }
}
