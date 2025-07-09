//Utility functions for the gallery component.

//Given a metadata array and the current year, returns a descending list of years present in the metadata.
export function getAvailableYears(metadata, currentYear) {
  const yearVals = metadata
    .map((item) => (item.year ? parseInt(item.year, 10) : null))
    .filter((y) => Number.isInteger(y))
  if (yearVals.length === 0) return []
  const minYear = Math.min(...yearVals)
  const years = []
  for (let y = currentYear; y >= minYear; y--) {
    years.push(y)
  }
  return years
}

//Returns an array of localized month names, starting with an empty placeholder at index 0.
export function getMonthNames(locale = 'es') {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'long' })
  return ['', ...Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)))]
}
