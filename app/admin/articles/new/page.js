'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useArticleEditor } from '@/lib/hooks/useArticleEditor'
import ArticleMetadataForm from '@/components/admin/ArticleMetadataForm'
import ArticleEditor from '@/components/admin/ArticleEditor'
import ArticlePreview from '@/components/admin/ArticlePreview'
import ImageUploadButton from '@/components/admin/ImageUploadButton'
import ComponentInsertMenu from '@/components/admin/ComponentInsertMenu'

/**
 * New Article Page - /admin/articles/new
 *
 * Full article creation interface with metadata form, CodeMirror editor,
 * and live MDX preview panel.
 */
export default function NewArticlePage() {
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
  } = useArticleEditor()

  const [authors, setAuthors] = useState([])
  const [allTags, setAllTags] = useState([])
  const [activeTab, setActiveTab] = useState('editor') // For mobile: 'editor' | 'preview'
  const editorRef = useRef(null)

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
        // Silently fail — author dropdown will show default
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
      // Error is already in saveError state
    }
  }, [saveDraft])

  const handlePublish = useCallback(async () => {
    try {
      await publish()
    } catch {
      // Error is already in saveError state
    }
  }, [publish])

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Nuevo Articulo</h1>
        </div>
        <div className="flex items-center gap-3">
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
