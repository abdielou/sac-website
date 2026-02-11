// lib/csv.js
// CSV generation and download utility

/**
 * Escape a value for CSV (RFC 4180)
 * Wraps in quotes if the value contains commas, quotes, or newlines
 */
function escapeCsvValue(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Convert an array of objects to a CSV string
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 * @returns {string} CSV string
 */
export function toCsv(data, columns) {
  const header = columns.map((col) => escapeCsvValue(col.label)).join(',')
  const rows = data.map((row) => columns.map((col) => escapeCsvValue(row[col.key])).join(','))
  return [header, ...rows].join('\r\n')
}

/**
 * Trigger a CSV file download in the browser
 * @param {string} csv - CSV string content
 * @param {string} filename - Download filename (without extension)
 */
export function downloadCsvFile(csv, filename) {
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
