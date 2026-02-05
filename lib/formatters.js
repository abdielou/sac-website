// lib/formatters.js
// Number, currency, and date formatting utilities for es-PR locale

// Create Intl formatter instances once at module level for performance
const numberFormatter = new Intl.NumberFormat('es-PR')

const currencyFormatter = new Intl.NumberFormat('es-PR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('es-PR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Format a number with thousand separators (es-PR locale)
 * @param {number|null|undefined} value - Number to format
 * @returns {string} Formatted number string (e.g., "1,234")
 */
export function formatNumber(value) {
  if (value == null) return '0'
  return numberFormatter.format(value)
}

/**
 * Format a number as USD currency (es-PR locale)
 * @param {number|null|undefined} value - Amount to format
 * @returns {string} Formatted currency string (e.g., "$1,234.50")
 */
export function formatCurrency(value) {
  if (value == null) return '$0.00'
  return currencyFormatter.format(value)
}

/**
 * Format a date in es-PR locale (dd/mm/yyyy)
 * @param {Date|string|null|undefined} value - Date to format
 * @returns {string} Formatted date string (e.g., "04/02/2026")
 */
export function formatDate(value) {
  if (!value) return '-'
  try {
    const date = value instanceof Date ? value : new Date(value)
    return dateFormatter.format(date)
  } catch {
    return String(value)
  }
}
