'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { getImageDimensions, buildImageSnippet } from '@/components/admin/ImageUploadButton'

// Dynamic import of CodeMirror to avoid SSR issues
const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), { ssr: false })

/**
 * Insert text at the current cursor position in a CodeMirror editor view
 */
export function insertAtCursor(view, text) {
  if (!view) return
  const { from } = view.state.selection.main
  view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  })
  view.focus()
}

/**
 * Wrap the current selection with prefix/suffix, or insert placeholder text
 */
function wrapSelection(view, prefix, suffix, placeholder) {
  if (!view) return
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)

  if (selected) {
    // Wrap selection
    const replacement = `${prefix}${selected}${suffix}`
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
    })
  } else {
    // Insert placeholder
    const text = `${prefix}${placeholder}${suffix}`
    view.dispatch({
      changes: { from, insert: text },
      selection: { anchor: from + prefix.length, head: from + prefix.length + placeholder.length },
    })
  }
  view.focus()
}

/**
 * Insert text at the beginning of the current line
 */
function insertAtLineStart(view, prefix) {
  if (!view) return
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  view.dispatch({
    changes: { from: line.from, insert: prefix },
    selection: { anchor: from + prefix.length },
  })
  view.focus()
}

/**
 * ArticleEditor - CodeMirror-based markdown editor with toolbar
 *
 * @param {object} props
 * @param {string} props.content - Markdown content
 * @param {function} props.onChange - Called when content changes
 * @param {React.RefObject} props.editorRef - Ref to receive the CodeMirror EditorView
 * @param {React.ReactNode} props.toolbarExtra - Additional toolbar buttons (image upload, component insert)
 */
export default function ArticleEditor({ content, onChange, editorRef, toolbarExtra }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const internalRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Store the editor view reference when CodeMirror creates it
  const handleCreateEditor = useCallback(
    (view) => {
      internalRef.current = view
      if (editorRef) {
        editorRef.current = view
      }
    },
    [editorRef]
  )

  // Toolbar action handlers
  const handleBold = useCallback(() => {
    wrapSelection(internalRef.current, '**', '**', 'texto')
  }, [])

  const handleItalic = useCallback(() => {
    wrapSelection(internalRef.current, '*', '*', 'texto')
  }, [])

  const handleHeading = useCallback(() => {
    insertAtLineStart(internalRef.current, '## ')
  }, [])

  const handleLink = useCallback(() => {
    const view = internalRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)

    if (selected) {
      const text = `[${selected}](url)`
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
      })
    } else {
      const text = '[texto](url)'
      view.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + 9, head: from + 12 },
      })
    }
    view.focus()
  }, [])

  const handleHorizontalRule = useCallback(() => {
    insertAtCursor(internalRef.current, '\n---\n')
  }, [])

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer?.files || [])
      const imageFiles = files.filter((f) => f.type.startsWith('image/'))

      for (const file of imageFiles) {
        try {
          const formData = new FormData()
          formData.append('file', file)

          const res = await fetch('/api/admin/articles/upload-image', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || 'Error al subir imagen')
          }

          const { url } = await res.json()
          const { width, height } = await getImageDimensions(file)
          const altText = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
          insertAtCursor(internalRef.current, buildImageSnippet(url, width, height, altText))
        } catch (err) {
          alert(err.message || 'Error al subir imagen')
        }
      }
    },

    []
  )

  // Extensions for CodeMirror
  const extensions = [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    EditorView.lineWrapping,
  ]

  if (mounted && resolvedTheme === 'dark') {
    extensions.push(oneDark)
  }

  const buttonClass =
    'p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors'

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 rounded-t-lg flex-wrap">
        <button type="button" onClick={handleBold} className={buttonClass} title="Negrita (Ctrl+B)">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleItalic}
          className={buttonClass}
          title="Italica (Ctrl+I)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 4h4m-2 0l-4 16m0 0h4"
            />
          </svg>
        </button>
        <button type="button" onClick={handleHeading} className={buttonClass} title="Encabezado">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <text x="2" y="17" fontSize="16" fontWeight="bold" fontFamily="sans-serif">
              H
            </text>
          </svg>
        </button>

        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        <button type="button" onClick={handleLink} className={buttonClass} title="Enlace">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleHorizontalRule}
          className={buttonClass}
          title="Linea horizontal"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
          </svg>
        </button>

        {toolbarExtra && (
          <>
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
            {toolbarExtra}
          </>
        )}
      </div>

      {/* Editor area */}
      <div
        className={`flex-1 min-h-[400px] relative ${
          isDragOver ? 'ring-2 ring-blue-500 ring-inset bg-blue-50 dark:bg-blue-900/20' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {mounted && (
          <CodeMirror
            value={content}
            onChange={onChange}
            extensions={extensions}
            onCreateEditor={handleCreateEditor}
            basicSetup={{
              lineNumbers: true,
              bracketMatching: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
            style={{ height: '100%', minHeight: '400px' }}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          />
        )}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 dark:bg-blue-900/40 pointer-events-none z-10">
            <p className="text-blue-600 dark:text-blue-400 font-medium">Suelta la imagen aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}
