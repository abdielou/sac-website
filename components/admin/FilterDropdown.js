'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { statusConfig } from '@/components/admin/StatusBadge'

/**
 * FilterDropdown - Multi-select dropdown for status and photo filters.
 * Replaces inline filter pills to declutter the toolbar.
 * Follows ColumnSelector's portal-based dropdown pattern.
 */
export function FilterDropdown({
  selectedStatuses,
  allStatuses,
  onStatusToggle,
  photoFilter,
  onPhotoFilterChange,
}) {
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

  useEffect(() => {
    if (!isOpen) return
    function handleMouseDown(e) {
      if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Count active filters (non-default statuses count as active, photo filter counts as 1)
  const activeCount =
    (selectedStatuses.length !== allStatuses.length ? 1 : 0) + (photoFilter ? 1 : 0)

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center gap-2"
        aria-label="Filtros"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filtros
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-blue-600 rounded-full">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-2 min-w-[220px] z-[9999]"
            role="dialog"
            aria-label="Filtros"
          >
            {/* Status section */}
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estado
              </p>
            </div>
            <div className="py-1">
              {allStatuses.map((s) => {
                const config = statusConfig[s]
                const isSelected = selectedStatuses.includes(s)
                return (
                  <label
                    key={s}
                    className="flex items-center px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onStatusToggle(s)}
                      className="w-4 h-4 flex-shrink-0 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span
                      className={`ml-3 inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${config.classes}`}
                    >
                      {config.label}
                    </span>
                  </label>
                )
              })}
            </div>

            {/* Photo section */}
            <div className="px-4 py-2 border-b border-t border-gray-200 dark:border-gray-600">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Foto
              </p>
            </div>
            <div className="py-1">
              <label className="flex items-center px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={photoFilter === 'with'}
                  onChange={() => onPhotoFilterChange(photoFilter === 'with' ? null : 'with')}
                  className="w-4 h-4 flex-shrink-0 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="ml-3 text-gray-700 dark:text-gray-200">Con foto</span>
              </label>
              <label className="flex items-center px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={photoFilter === 'without'}
                  onChange={() => onPhotoFilterChange(photoFilter === 'without' ? null : 'without')}
                  className="w-4 h-4 flex-shrink-0 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="ml-3 text-gray-700 dark:text-gray-200">Sin foto</span>
              </label>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export default FilterDropdown
