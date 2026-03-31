'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import GuideEditor from '@/components/admin/GuideEditor'

/**
 * EditGuidePage - Edit an existing observing guide
 * Loads the guide by slug from the API and renders GuideEditor with initialGuide.
 */
export default function EditGuidePage() {
  const { slug } = useParams()
  const { data: session } = useSession()
  const canWrite = (session?.user?.accessibleActions || []).includes('write_guides')
  const [guide, setGuide] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!slug) return

    let cancelled = false
    const loadGuide = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/admin/guides/${slug}`)
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('not_found')
          }
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Error al cargar la guia')
        }

        const data = await res.json()
        if (!cancelled) {
          setGuide(data.guide || data)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadGuide()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Editar Guia</h1>
        <div className="space-y-4">
          {/* Skeleton for title */}
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          {/* Skeleton for editor area */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Editar Guia</h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Guia no encontrada. Es posible que haya sido eliminada.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Editar Guia</h1>
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Editar Guia</h1>
      <GuideEditor initialGuide={guide} readOnly={!canWrite} />
    </div>
  )
}
