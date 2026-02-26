'use client'

import { useState, useEffect } from 'react'
import { COLUMN_REGISTRY, getDefaultColumnIds } from '@/lib/admin/columnRegistry'

const STORAGE_KEY = 'admin_members_columns'

/**
 * Custom hook for managing column preferences with localStorage persistence
 *
 * Manages visible column IDs with:
 * - localStorage persistence (with error handling)
 * - Last-column protection (prevents hiding all columns)
 * - Reset to default functionality
 *
 * @returns {Object} Column preferences state and actions
 * @returns {Array} visibleColumns - Array of visible column definitions
 * @returns {string[]} visibleColumnIds - Array of visible column IDs
 * @returns {Function} toggleColumn - Toggle column visibility by ID
 * @returns {Function} resetToDefault - Reset to default column configuration
 */
export function useColumnPreferences() {
  /**
   * Load initial column IDs from localStorage or fall back to defaults
   * Handles localStorage failures gracefully
   */
  const getInitialColumns = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Validate that parsed value is an array
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.error('Failed to load column preferences:', e)
    }
    // Fall back to default columns
    return getDefaultColumnIds()
  }

  const [visibleColumnIds, setVisibleColumnIds] = useState(getInitialColumns)

  // Save to localStorage whenever columns change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumnIds))
    } catch (e) {
      console.error('Failed to save column preferences:', e)
    }
  }, [visibleColumnIds])

  /**
   * Toggle column visibility by ID
   * Prevents hiding the last visible column
   *
   * @param {string} columnId - Column ID to toggle
   */
  const toggleColumn = (columnId) => {
    setVisibleColumnIds((prev) => {
      // Prevent hiding all columns (last-column protection)
      if (prev.includes(columnId) && prev.length === 1) {
        return prev
      }

      return prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    })
  }

  /**
   * Reset column selection to default configuration
   */
  const resetToDefault = () => {
    const defaultIds = getDefaultColumnIds()
    setVisibleColumnIds(defaultIds)
  }

  // Get full column definitions for visible columns
  const visibleColumns = COLUMN_REGISTRY.filter((col) => visibleColumnIds.includes(col.id))

  return {
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    resetToDefault,
  }
}
