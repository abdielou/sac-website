'use client'

import { useState, useEffect, useRef } from 'react'
import { MDXRemote } from 'next-mdx-remote'
import { MDXComponents } from '@/components/MDXComponents'
import TOCInline from '@/components/TOCInline'

/**
 * ArticlePreview - Live MDX preview panel for the article editor
 *
 * Debounces content changes (500ms) before fetching compiled MDX from
 * the preview API endpoint. Renders result with the same MDX components
 * used on the public blog.
 *
 * @param {object} props
 * @param {string} props.content - Raw markdown/MDX content to preview
 */
export default function ArticlePreview({ content }) {
  const [mdxSource, setMdxSource] = useState(null)
  const [toc, setToc] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Cancel previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (!content?.trim()) {
      setMdxSource(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const res = await fetch('/api/admin/articles/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error('Error al obtener vista previa')
        }

        const data = await res.json()

        if (data.error) {
          setError(data.error)
          setMdxSource(null)
        } else {
          setMdxSource(data.mdxSource)
          setToc(data.toc || [])
          setError(null)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setMdxSource(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 500)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [content])

  // Empty state
  if (!content?.trim() && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-gray-400 dark:text-gray-500 text-sm">
        Escribe contenido para ver la vista previa
      </div>
    )
  }

  // Loading state
  if (isLoading && !mdxSource) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-gray-400 dark:text-gray-500 text-sm">
        Compilando...
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        {isLoading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Compilando...</p>
        )}
        <div className="border border-red-300 dark:border-red-700 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
            Error de compilacion
          </p>
          <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-words font-mono">
            {error}
          </pre>
        </div>
      </div>
    )
  }

  // Rendered preview
  return (
    <div className="p-4 overflow-y-auto">
      {isLoading && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Compilando...</p>}
      {mdxSource && (
        <div className="prose dark:prose-dark max-w-none">
          <MDXRemote
            {...mdxSource}
            components={{
              ...MDXComponents,
              TOCInline: (props) => <TOCInline {...props} toc={toc} />,
            }}
          />
        </div>
      )}
    </div>
  )
}
