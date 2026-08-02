/**
 * Character-width heuristics for wrapping / fitting text without a canvas measure API.
 * Mirrors the fitFontSize approach in lib/id-card/IdCard.js.
 */

/**
 * Estimate rendered width of a string at a given font size.
 * @param {string} text
 * @param {number} fontSize
 * @param {number} [charRatio=0.55]
 */
export function estimateTextWidth(text, fontSize, charRatio = 0.55) {
  return String(text || '').length * fontSize * charRatio
}

/**
 * Shrink font size until text fits maxWidth (single line).
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} baseSize
 * @param {number} [minSize]
 * @param {number} [charRatio=0.55]
 */
export function fitFontSize(text, maxWidth, baseSize, minSize = 12, charRatio = 0.55) {
  let size = baseSize
  while (size > minSize && estimateTextWidth(text, size, charRatio) > maxWidth) {
    size -= 1
  }
  return size
}

/**
 * Greedy word wrap into at most maxLines. Truncates with ellipsis if needed.
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} fontSize
 * @param {{ maxLines?: number, charRatio?: number }} [options]
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, fontSize, options = {}) {
  const maxLines = options.maxLines ?? 3
  const charRatio = options.charRatio ?? 0.55
  const raw = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return []

  const words = raw.split(' ')
  const lines = []
  let current = ''
  let wordIndex = 0

  while (wordIndex < words.length && lines.length < maxLines) {
    const word = words[wordIndex]
    const candidate = current ? `${current} ${word}` : word

    if (estimateTextWidth(candidate, fontSize, charRatio) <= maxWidth) {
      current = candidate
      wordIndex += 1
      continue
    }

    if (current) {
      lines.push(current)
      current = ''
      continue
    }

    // Single oversized word: mark it as truncated so fitAndWrapText keeps
    // shrinking instead of silently dropping the rest of the word.
    let truncated = word
    while (
      truncated.length > 1 &&
      estimateTextWidth(`${truncated}…`, fontSize, charRatio) > maxWidth
    ) {
      truncated = truncated.slice(0, -1)
    }
    const didTruncateWord = truncated.length < word.length
    lines.push(didTruncateWord ? `${truncated}…` : truncated)
    wordIndex += 1
    if (didTruncateWord) wordIndex = words.length
  }

  if (current && lines.length < maxLines) {
    lines.push(current)
    current = ''
    wordIndex = words.length
  }

  const hasOverflow = wordIndex < words.length || (current && lines.length >= maxLines)
  if (hasOverflow && lines.length > 0) {
    let last = lines[lines.length - 1].replace(/…$/, '')
    const ellipsis = '…'
    while (
      last.length > 1 &&
      estimateTextWidth(`${last}${ellipsis}`, fontSize, charRatio) > maxWidth
    ) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = `${last}${ellipsis}`
  }

  return lines.slice(0, maxLines)
}

/**
 * Find the most even two-line break that fits. This avoids a nearly full first
 * line followed by an orphaned last word, which is especially distracting in
 * centered poster copy.
 */
function wrapBalancedTwoLines(text, maxWidth, fontSize, charRatio) {
  const raw = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw || estimateTextWidth(raw, fontSize, charRatio) <= maxWidth) {
    return raw ? [raw] : []
  }

  const words = raw.split(' ')
  let bestCandidate = null
  for (let splitIndex = 1; splitIndex < words.length; splitIndex += 1) {
    const firstLine = words.slice(0, splitIndex).join(' ')
    const secondLine = words.slice(splitIndex).join(' ')
    const firstWidth = estimateTextWidth(firstLine, fontSize, charRatio)
    const secondWidth = estimateTextWidth(secondLine, fontSize, charRatio)
    if (firstWidth > maxWidth || secondWidth > maxWidth) continue

    const score = Math.abs(firstWidth - secondWidth)
    if (!bestCandidate || score < bestCandidate.score) {
      bestCandidate = { lines: [firstLine, secondLine], score }
    }
  }

  return bestCandidate?.lines || null
}

/**
 * Fit font size then wrap. Shrinks until wrap produces <= maxLines without ellipsis when possible.
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxFontSize
 * @param {number} minFontSize
 * @param {{ maxLines?: number, charRatio?: number, balanceLines?: boolean }} [options]
 * @returns {{ fontSize: number, lines: string[] }}
 */
export function fitAndWrapText(text, maxWidth, maxFontSize, minFontSize, options = {}) {
  const maxLines = options.maxLines ?? 3
  const charRatio = options.charRatio ?? 0.55
  const wrapAtSize = (fontSize) => {
    if (options.balanceLines && maxLines === 2) {
      const balancedLines = wrapBalancedTwoLines(text, maxWidth, fontSize, charRatio)
      if (balancedLines) return balancedLines
    }
    return wrapText(text, maxWidth, fontSize, { maxLines, charRatio })
  }
  let fontSize = maxFontSize
  let lines = wrapAtSize(fontSize)

  while (fontSize > minFontSize) {
    const withoutEllipsis = !lines.some((line) => line.endsWith('…'))
    if (withoutEllipsis && lines.length <= maxLines) {
      break
    }
    fontSize -= 1
    lines = wrapAtSize(fontSize)
  }

  return { fontSize, lines }
}
