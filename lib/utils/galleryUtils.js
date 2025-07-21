// Returns the distinct years present in an array of image metadata, sorted in descending order.
export function getAvailableYears(metadata) {
  // Return only the distinct years found in metadata, sorted descending
  const years = Array.from(
    new Set(
      metadata
        .map((item) => {
          const y = typeof item.year === 'number' ? item.year : parseInt(item.year, 10)
          return Number.isInteger(y) ? y : null
        })
        .filter((y) => y != null)
    )
  )
  return years.sort((a, b) => b - a)
}

// Returns an array of localized month names for a given locale, with an empty placeholder at index 0.
export function getMonthNames(locale = 'es') {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'long' })
  return ['', ...Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)))]
}
