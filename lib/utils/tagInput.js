/**
 * Helpers for the tag input in the article editor.
 *
 * Authors type or paste a comma separated list of tags. Without a split step
 * the whole line becomes one tag, which produces slugs such as
 * `marte-planeta-marte-eclipse-desde`.
 */

const SEPARATORS = /[,\n\r]+/

/**
 * Split a raw tag input string into individual tag names.
 *
 * @param {string} raw - Text typed or pasted in the tag input
 * @returns {Array<string>} Trimmed, non-empty, de-duplicated tag names
 */
export function parseTagInput(raw) {
  if (typeof raw !== 'string') return []

  const seen = []
  raw
    .split(SEPARATORS)
    .map((tag) => tag.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .forEach((tag) => {
      if (!seen.includes(tag)) seen.push(tag)
    })

  return seen
}

/**
 * Add every tag found in the raw input to the already selected tags.
 *
 * @param {Array<string>} existing - Tags already selected
 * @param {string} raw - Text typed or pasted in the tag input
 * @returns {Array<string>} New list, or `existing` when there is nothing to add
 */
export function mergeTags(existing, raw) {
  const current = Array.isArray(existing) ? existing : []
  const added = parseTagInput(raw).filter((tag) => !current.includes(tag))

  if (added.length === 0) return current
  return [...current, ...added]
}
