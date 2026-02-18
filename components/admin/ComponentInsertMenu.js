'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { insertAtCursor } from '@/components/admin/ArticleEditor'

/**
 * Component definitions for the insert menu
 */
const COMPONENTS = [
  {
    id: 'youtube',
    label: 'YouTube',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
    needsUrl: true,
    template: (url) => `<ResponsiveReactPlayer url="${url}" />`,
    placeholder: 'URL de YouTube',
  },
  {
    id: 'facebook',
    label: 'Facebook Video',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    needsUrl: true,
    template: (url) => `<ResponsiveReactPlayer url="${url}" platform="facebook" />`,
    placeholder: 'URL de Facebook',
  },
  {
    id: 'twitter',
    label: 'Twitter/X',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    needsUrl: true,
    template: (url) => `<TwitterEmbed url="${url}" />`,
    placeholder: 'URL del tweet',
  },
  {
    id: 'toc',
    label: 'Tabla de contenidos',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16"
        />
      </svg>
    ),
    needsUrl: false,
    template: () => `<TOCInline toc={toc} />`,
  },
]

/**
 * ComponentInsertMenu - Dropdown menu for inserting MDX component tags
 *
 * Provides options for YouTube, Facebook, Twitter, ImageCaption, and TOC.
 * URL-based components prompt for the URL before inserting.
 *
 * @param {object} props
 * @param {React.RefObject} props.editorRef - Ref to the CodeMirror EditorView
 */
export default function ComponentInsertMenu({ editorRef }) {
  const [isOpen, setIsOpen] = useState(false)
  const [urlPrompt, setUrlPrompt] = useState(null) // { component, value }
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
        setUrlPrompt(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus URL input when shown
  useEffect(() => {
    if (urlPrompt && inputRef.current) {
      inputRef.current.focus()
    }
  }, [urlPrompt])

  const handleSelect = useCallback(
    (component) => {
      if (component.needsUrl) {
        setUrlPrompt({ component, value: '' })
      } else {
        const text = component.template()
        insertAtCursor(editorRef?.current, text + '\n')
        setIsOpen(false)
      }
    },
    [editorRef]
  )

  const handleUrlSubmit = useCallback(
    (e) => {
      e.preventDefault()
      if (!urlPrompt?.value.trim()) return

      const text = urlPrompt.component.template(urlPrompt.value.trim())
      insertAtCursor(editorRef?.current, text + '\n')
      setIsOpen(false)
      setUrlPrompt(null)
    },
    [urlPrompt, editorRef]
  )

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          setUrlPrompt(null)
        }}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors inline-flex items-center gap-1"
        title="Insertar componente"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
          {!urlPrompt ? (
            <div className="py-1">
              {COMPONENTS.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => handleSelect(comp)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-gray-500 dark:text-gray-400">{comp.icon}</span>
                  {comp.label}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleUrlSubmit} className="p-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {urlPrompt.component.label}
              </label>
              <input
                ref={inputRef}
                type="url"
                value={urlPrompt.value}
                onChange={(e) =>
                  setUrlPrompt((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }))
                }
                placeholder={urlPrompt.component.placeholder}
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white placeholder-gray-400"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setUrlPrompt(null)}
                  className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Insertar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
