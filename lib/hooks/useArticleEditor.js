'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Custom hook managing article editor state and operations.
 *
 * Handles metadata, content, save/publish, delete, and dirty tracking.
 * Detects new vs edit mode from initialArticle presence.
 *
 * @param {object|null} initialArticle - Existing article data for edit mode, null for new
 * @returns {object} Editor state and methods
 */
export function useArticleEditor(initialArticle = null) {
  const router = useRouter()
  const isNew = !initialArticle

  const [metadata, setMetadata] = useState(() => ({
    title: initialArticle?.title || '',
    date: initialArticle?.date || new Date().toISOString(),
    tags: initialArticle?.tags || [],
    summary: initialArticle?.summary || '',
    authors: initialArticle?.authors || ['default'],
    images: initialArticle?.images || [],
    imgWidth: initialArticle?.imgWidth || null,
    imgHeight: initialArticle?.imgHeight || null,
    draft: initialArticle?.draft !== undefined ? initialArticle.draft : true,
  }))

  const [content, setContent] = useState(initialArticle?.content || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [lastSaved, setLastSaved] = useState(null)
  const [isDirty, setIsDirty] = useState(false)

  // Track the current slug for edit mode (may change after first save of new article)
  const slugRef = useRef(initialArticle?.slug || null)

  const updateMetadata = useCallback((field, value) => {
    setMetadata((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateContent = useCallback((newContent) => {
    setContent(newContent)
    setIsDirty(true)
  }, [])

  /**
   * Revalidate blog paths after save/publish
   */
  const revalidate = useCallback(async (slug) => {
    try {
      const paths = [`/blog/${slug}`]
      await fetch('/api/admin/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      })
    } catch {
      // Revalidation failure is non-critical
    }
  }, [])

  /**
   * Save as draft (draft=true)
   */
  const saveDraft = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const payload = {
        ...metadata,
        content,
        draft: true,
      }

      let res
      if (isNew && !slugRef.current) {
        // Create new article
        res = await fetch('/api/admin/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Update existing article
        res = await fetch(`/api/admin/articles/${slugRef.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al guardar')
      }

      const data = await res.json()
      const article = data.article

      setIsDirty(false)
      setLastSaved(new Date())

      // Revalidate
      await revalidate(article.slug)

      // If new article, navigate to edit URL (replace so back goes to list)
      if (isNew && !slugRef.current) {
        slugRef.current = article.slug
        router.replace(`/admin/articles/edit/${article.slug}`)
      } else {
        slugRef.current = article.slug
      }

      return article
    } catch (err) {
      setSaveError(err.message)
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [metadata, content, isNew, router, revalidate])

  /**
   * Save and publish (draft=false)
   */
  const publish = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const payload = {
        ...metadata,
        content,
        draft: false,
      }

      let res
      if (isNew && !slugRef.current) {
        res = await fetch('/api/admin/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/admin/articles/${slugRef.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al publicar')
      }

      const data = await res.json()
      const article = data.article

      setMetadata((prev) => ({ ...prev, draft: false }))
      setIsDirty(false)
      setLastSaved(new Date())

      // Revalidate
      await revalidate(article.slug)

      // If new article, navigate to edit URL
      if (isNew && !slugRef.current) {
        slugRef.current = article.slug
        router.replace(`/admin/articles/edit/${article.slug}`)
      } else {
        slugRef.current = article.slug
      }

      return article
    } catch (err) {
      setSaveError(err.message)
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [metadata, content, isNew, router, revalidate])

  /**
   * Delete the article
   */
  const deleteArticle = useCallback(async () => {
    if (!slugRef.current) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const res = await fetch(`/api/admin/articles/${slugRef.current}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al eliminar')
      }

      router.push('/admin/articles')
    } catch (err) {
      setSaveError(err.message)
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [router])

  return {
    metadata,
    content,
    isSaving,
    saveError,
    lastSaved,
    isDirty,
    isNew: isNew && !slugRef.current,
    updateMetadata,
    updateContent,
    saveDraft,
    publish,
    deleteArticle,
  }
}
