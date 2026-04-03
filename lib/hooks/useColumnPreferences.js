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
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.storageKey] - localStorage key (defaults to 'admin_members_columns')
 * @param {Array} [options.registry] - Column registry to use (defaults to COLUMN_REGISTRY)
 * @returns {Object} Column preferences state and actions
 * @returns {Array} visibleColumns - Array of visible column definitions
 * @returns {string[]} visibleColumnIds - Array of visible column IDs
 * @returns {Function} toggleColumn - Toggle column visibility by ID
 * @returns {Function} resetToDefault - Reset to default column configuration
 */
export function useColumnPreferences(options = {}) {
  const storageKey = options.storageKey || STORAGE_KEY
  const registry = options.registry || COLUMN_REGISTRY
  /**
   * Load initial column IDs from localStorage or fall back to defaults
   * Handles localStorage failures gracefully
   */
  const getInitialColumns = () => {
    try {
      const stored = localStorage.getItem(storageKey)
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
    return registry.filter((col) => col.defaultVisible).map((col) => col.id)
  }

  const [visibleColumnIds, setVisibleColumnIds] = useState(getInitialColumns)

  // Save to localStorage whenever columns change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleColumnIds))
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
    const defaultIds = registry.filter((col) => col.defaultVisible).map((col) => col.id)
    setVisibleColumnIds(defaultIds)
  }

  // Get full column definitions for visible columns
  const visibleColumns = registry.filter((col) => visibleColumnIds.includes(col.id))

  return {
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    resetToDefault,
  }
}
