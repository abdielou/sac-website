// lib/formatters.js
// Number and currency formatting utilities for es-PR locale

// Create Intl.NumberFormat instances once at module level for performance
const numberFormatter = new Intl.NumberFormat('es-PR')

const currencyFormatter = new Intl.NumberFormat('es-PR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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
