'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IdCardPreview } from '@/components/member/IdCardPreview'

/**
 * Modal to preview a member ID card before downloading.
 *
 * @param {{ isOpen: boolean, onClose: () => void, member: { email: string, name?: string, photoFileId?: string } | null }} props
 */
export function MemberIdCardPreviewModal({ isOpen, onClose, member }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen || !member?.email) {
      setProfile(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setProfile(null)

    fetch(`/api/admin/members/${encodeURIComponent(member.email)}/id-card-preview`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.details || body.error || 'Error al cargar vista previa')
        }
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Error al cargar vista previa')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, member?.email])

  if (!isOpen || !member) return null

  const title = `Vista previa del ID — ${member.name || member.email}`
  const canDownload = Boolean(profile?.photoFileId)

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col items-center gap-4">
          {member.name && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
          )}

          {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Cargando ID...</p>}

          {error && <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>}

          {profile && !loading && (
            <div className="w-64">
              <IdCardPreview profile={profile} />
            </div>
          )}

          {!profile?.photoFileId && profile && !loading && (
            <p className="text-xs text-orange-600 dark:text-orange-400 text-center">
              Sin foto de perfil. Agrega una foto para poder descargar el PDF.
            </p>
          )}

          <div className="flex gap-2 w-full justify-center pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cerrar
            </button>
            {canDownload && (
              <a
                href={`/api/admin/members/${encodeURIComponent(member.email)}/id-card`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Descargar PDF
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default MemberIdCardPreviewModal
