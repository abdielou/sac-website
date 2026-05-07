'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import PermissionGate from '@/components/admin/PermissionGate'
import MediaCard from '@/components/admin/MediaCard'
import MediaUploadZone from '@/components/admin/MediaUploadZone'
import MediaEditModal from '@/components/admin/MediaEditModal'
import { SkeletonCard } from '@/components/admin/SkeletonCard'

/**
 * Confirm dialog rendered via portal.
 */
function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null
  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * MediaContent - Main media manager content.
 */
function MediaContent() {
  const { data: session } = useSession()
  const canManage = session?.user?.accessibleActions?.includes('write_media') ?? false

  const [media, setMedia] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Edit modal state
  const [editTarget, setEditTarget] = useState(null) // media entry being edited
  const [editIsOpen, setEditIsOpen] = useState(false)
  const [editError, setEditError] = useState(null)

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteIsOpen, setDeleteIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchMedia = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/media?pageSize=5000')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al cargar medios')
      }
      const data = await res.json()
      setMedia(data.media || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  // Listen for 'media-uploaded' event dispatched by MediaUploadZone
  useEffect(() => {
    const handleMediaUploaded = (e) => {
      const entry = e.detail?.media
      if (entry) {
        setMedia((prev) => [entry, ...prev])
      }
    }
    window.addEventListener('media-uploaded', handleMediaUploaded)
    const handlePosterReady = (e) => {
      const entry = e.detail?.media
      if (!entry?.slug) return
      setMedia((prev) => prev.map((m) => (m.slug === entry.slug ? { ...m, ...entry } : m)))
      setEditTarget((prev) => (prev?.slug === entry.slug ? { ...prev, ...entry } : prev))
    }
    window.addEventListener('media-poster-ready', handlePosterReady)
    return () => {
      window.removeEventListener('media-uploaded', handleMediaUploaded)
      window.removeEventListener('media-poster-ready', handlePosterReady)
    }
  }, [])

  // Open edit modal
  const handleEdit = useCallback((mediaEntry) => {
    setEditTarget(mediaEntry)
    setEditError(null)
    setEditIsOpen(true)
  }, [])

  // Save edited media
  const handleSaveEdit = useCallback(async ({ slug, title, description, thumbnail, newSlug }) => {
    try {
      const body = { title, description }
      if (thumbnail?.trim()) {
        body.thumbnail = thumbnail.trim()
      }
      if (newSlug?.trim()) {
        body.slug = newSlug.trim()
      }
      const res = await fetch(`/api/admin/media/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al guardar')
      }
      const { entry } = await res.json()
      setMedia((prev) => prev.map((m) => (m.slug === slug ? entry : m)))
      setEditIsOpen(false)
      setEditTarget(null)
    } catch (err) {
      setEditError(err.message)
      throw err
    }
  }, [])

  // Open delete confirm
  const handleDeleteClick = useCallback((mediaEntry) => {
    setDeleteTarget(mediaEntry)
    setDeleteIsOpen(true)
  }, [])

  // Confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/media/${deleteTarget.slug}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al eliminar')
      }
      setMedia((prev) => prev.filter((m) => m.slug !== deleteTarget.slug))
      setDeleteIsOpen(false)
      setDeleteTarget(null)
    } catch (err) {
      alert(err.message || 'Error al eliminar')
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTarget])

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Multimedia</h1>
      </div>

      {/* Upload zone (only for users with write_media) */}
      {canManage && (
        <div className="mb-8">
          <MediaUploadZone uploadUrl="/api/admin/media/upload" accept="video/*,image/*" />
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={fetchMedia}
            className="mt-2 text-xs text-red-600 dark:text-red-400 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : media.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <svg
            className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">
            {canManage
              ? 'No hay archivos multimedia. Sube un video para comenzar.'
              : 'No hay archivos multimedia disponibles.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {media.map((m) => (
            <MediaCard
              key={m.slug}
              media={m}
              canManage={canManage}
              onEdit={() => handleEdit(m)}
              onDelete={() => handleDeleteClick(m)}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      <MediaEditModal
        isOpen={editIsOpen}
        onClose={() => {
          setEditIsOpen(false)
          setEditTarget(null)
        }}
        media={editTarget}
        onSave={handleSaveEdit}
      />

      {/* Delete confirm dialog */}
      <ConfirmDialog
        isOpen={deleteIsOpen}
        title="Eliminar medio"
        message={`Estas seguro de eliminar "${deleteTarget?.title}"? Esta accion no se puede deshacer.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteIsOpen(false)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

/**
 * MediaPage - Main export with PermissionGate.
 * Allows users with read_media (view-only) or write_media (full management).
 */
export default function MediaPage() {
  return (
    <PermissionGate permission={['read_media', 'write_media']}>
      <MediaContent />
    </PermissionGate>
  )
}
