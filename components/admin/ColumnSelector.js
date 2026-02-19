'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { COLUMN_REGISTRY } from '@/lib/admin/columnRegistry'

/**
 * ColumnSelector - Dropdown component for selecting visible table columns
 * Displays checkboxes for all available columns with visual indicators
 * Includes "Reset to Default" button and visible column count
 * 
 * @param {Object} props
 * @param {string[]} props.visibleColumnIds - Array of currently visible column IDs
 * @param {Function} props.onColumnToggle - Callback to toggle column visibility (columnId) => void
 * @param {Function} props.onReset - Callback to reset to default columns
 */
export function ColumnSelector({ visibleColumnIds, onColumnToggle, onReset }) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }, [])

  // Position menu when opening, reposition on scroll/resize
  useEffect(() => {
    if (!isOpen) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, updatePosition])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleMouseDown(e) {
      if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleToggle = (columnId) => {
    onColumnToggle(columnId)
  }

  const handleReset = () => {
    onReset()
    setIsOpen(false)
  }

  const visibleCount = visibleColumnIds.length

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center gap-2"
        aria-label="Seleccionar columnas"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
          />
        </svg>
        <span suppressHydrationWarning>{visibleCount} columnas</span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-2 min-w-[420px] max-h-[400px] overflow-y-auto z-[9999]"
            role="dialog"
            aria-label="Selector de columnas"
          >
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Columnas visibles
              </p>
            </div>

            <div className="py-1">
              {COLUMN_REGISTRY.map((column) => {
                const isVisible = visibleColumnIds.includes(column.id)
                const isLastVisible = isVisible && visibleCount === 1

                return (
                  <label
                    key={column.id}
                    className={`flex items-center px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer ${
                      isLastVisible ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (!isLastVisible) {
                          handleToggle(column.id)
                        }
                      }
                    }}
                    tabIndex={0}
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => handleToggle(column.id)}
                      disabled={isLastVisible}
                      className="w-4 h-4 flex-shrink-0 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      aria-label={`${isVisible ? 'Ocultar' : 'Mostrar'} columna ${column.label}`}
                    />
                    <span className="ml-3 flex-1 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                      {column.label}
                    </span>
                    {isVisible && (
                      <svg
                        className="w-4 h-4 ml-2 flex-shrink-0 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </label>
                )
              })}
            </div>

            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-600">
              <button
                type="button"
                onClick={handleReset}
                className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors"
              >
                Restablecer por defecto
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export default ColumnSelector
