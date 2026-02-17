'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useArticleEditor } from '@/lib/hooks/useArticleEditor'
import ArticleMetadataForm from '@/components/admin/ArticleMetadataForm'
import ArticleEditor from '@/components/admin/ArticleEditor'
import ArticlePreview from '@/components/admin/ArticlePreview'
import ImageUploadButton from '@/components/admin/ImageUploadButton'
import ComponentInsertMenu from '@/components/admin/ComponentInsertMenu'

/**
 * Edit Article Page - /admin/articles/edit/[...slug]
 *
 * Loads existing article data and provides the same editor interface
 * as the new article page, plus delete functionality.
 */
export default function EditArticlePage() {
  const params = useParams()
  const slug = params?.slug ? params.slug.join('/') : ''

  const [article, setArticle] = useState(null)
  const [isLoadingArticle, setIsLoadingArticle] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [authors, setAuthors] = useState([])
  const [allTags, setAllTags] = useState([])
  const [activeTab, setActiveTab] = useState('editor')
  const editorRef = useRef(null)

  // Fetch article data on mount
  useEffect(() => {
    if (!slug) return

    async function fetchArticle() {
      setIsLoadingArticle(true)
      setLoadError(null)

      try {
        const res = await fetch(`/api/admin/articles/${slug}`)
        if (res.status === 404) {
          setLoadError('Articulo no encontrado')
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Error al cargar el articulo')
        }

        const data = await res.json()
        setArticle(data.article)
      } catch (err) {
        setLoadError(err.message)
      } finally {
        setIsLoadingArticle(false)
      }
    }

    fetchArticle()
  }, [slug])

  // Fetch authors on mount
  useEffect(() => {
    async function fetchAuthors() {
      try {
        const res = await fetch('/api/admin/articles/authors')
        if (res.ok) {
          const data = await res.json()
          setAuthors(data.authors || [])
        }
      } catch {
        // Silently fail
      }
    }
    fetchAuthors()
  }, [])

  // Fetch all tags on mount
  useEffect(() => {
    async function fetchTags() {
      try {
        const res = await fetch('/api/admin/articles?pageSize=9999')
        if (res.ok) {
          const data = await res.json()
          const tags = new Set()
          ;(data.articles || []).forEach((a) => {
            if (Array.isArray(a.tags)) {
              a.tags.forEach((t) => tags.add(t))
            }
          })
          setAllTags(Array.from(tags).sort())
        }
      } catch {
        // Silently fail
      }
    }
    fetchTags()
  }, [])

  // Loading skeleton
  if (isLoadingArticle) {
    return (
      <div className="max-w-full animate-pulse">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 space-y-4">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="flex gap-4">
          <div className="w-1/2 h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="w-1/2 h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    )
  }

  // Error state
  if (loadError) {
    return (
      <div className="max-w-full">
        <Link
          href="/admin/articles"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          &larr; Volver a articulos
        </Link>
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">{loadError}</p>
          <Link
            href="/admin/articles"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Volver a la lista
          </Link>
        </div>
      </div>
    )
  }

  if (!article) return null

  return (
    <EditArticleContent
      article={article}
      authors={authors}
      allTags={allTags}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      editorRef={editorRef}
      showDeleteConfirm={showDeleteConfirm}
      setShowDeleteConfirm={setShowDeleteConfirm}
    />
  )
}

/**
 * Inner component that uses the article editor hook.
 * Separated because useArticleEditor needs initialArticle at mount time.
 */
function EditArticleContent({
  article,
  authors,
  allTags,
  activeTab,
  setActiveTab,
  editorRef,
  showDeleteConfirm,
  setShowDeleteConfirm,
}) {
  const {
    metadata,
    content,
    isSaving,
    saveError,
    lastSaved,
    isDirty,
    updateMetadata,
    updateContent,
    saveDraft,
    publish,
    deleteArticle,
  } = useArticleEditor(article)

  // Unsaved changes warning
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const handleSaveDraft = useCallback(async () => {
    try {
      await saveDraft()
    } catch {
      // Error is in saveError state
    }
  }, [saveDraft])

  const handlePublish = useCallback(async () => {
    try {
      await publish()
    } catch {
      // Error is in saveError state
    }
  }, [publish])

  const handleDelete = useCallback(async () => {
    try {
      await deleteArticle()
    } catch {
      // Error is in saveError state
    }
  }, [deleteArticle])

  return (
    <div className="max-w-full">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <Link
            href="/admin/articles"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            &larr; Volver a articulos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Editar Articulo</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          {metadata.draft ? (
            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              Borrador
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              Publicado
            </span>
          )}

          {/* Save status */}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {isSaving && 'Guardando...'}
            {!isSaving && saveError && (
              <span className="text-red-600 dark:text-red-400">{saveError}</span>
            )}
            {!isSaving && !saveError && lastSaved && (
              <span>
                Guardado{' '}
                {lastSaved.toLocaleTimeString('es-PR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </span>

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
          >
            Eliminar
          </button>

          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Guardar borrador
          </button>
          <button
            onClick={handlePublish}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Publicar
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Eliminar articulo
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              ¿Seguro que deseas eliminar este articulo? Esta accion no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata form */}
      <ArticleMetadataForm
        metadata={metadata}
        onUpdate={updateMetadata}
        authors={authors}
        allTags={allTags}
      />

      {/* Mobile tab switcher */}
      <div className="flex lg:hidden mb-2 bg-white dark:bg-gray-800 rounded-lg shadow">
        <button
          onClick={() => setActiveTab('editor')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${
            activeTab === 'editor'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${
            activeTab === 'preview'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          Vista previa
        </button>
      </div>

      {/* Editor + Preview split pane */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Editor (left) */}
        <div
          className={`lg:w-1/2 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden ${
            activeTab !== 'editor' ? 'hidden lg:block' : ''
          }`}
        >
          <ArticleEditor
            content={content}
            onChange={updateContent}
            editorRef={editorRef}
            toolbarExtra={
              <>
                <ImageUploadButton editorRef={editorRef} />
                <ComponentInsertMenu editorRef={editorRef} />
              </>
            }
          />
        </div>

        {/* Preview (right) */}
        <div
          className={`lg:w-1/2 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden min-h-[400px] ${
            activeTab !== 'preview' ? 'hidden lg:block' : ''
          }`}
        >
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Vista previa
            </span>
          </div>
          <ArticlePreview content={content} />
        </div>
      </div>
    </div>
  )
}
