/** CR80 card dimensions in points (1pt = 1/72 inch) */
export const CARD = {
  WIDTH_PT: 2.125 * 72, // 153
  HEIGHT_PT: 3.375 * 72, // 243
  ASPECT_RATIO: '2.125 / 3.375',
  BG_COLOR: '#221E5A',
  NAME_COLOR: '#560647', // sac-primary-violet
  YEAR_COLOR: '#1B1751', // sac-primary-blue
  // PDF uses 'Gilroy' (registered via Font.register), browser falls back to Open Sans
  FONT_FAMILY: 'Gilroy',
  FONT_FAMILY_BROWSER: "'Open Sans', 'Gilroy', sans-serif",
}

/** Layout tokens — numeric values in points.
 *  Used directly by react-pdf, converted to px/rem by HTML renderer. */
export const LAYOUT = {
  paddingHorizontal: 12,
  paddingVertical: 20,
  logo: { width: 100, height: 38, marginBottom: 4 },
  photo: { size: 68, borderRadius: 34, marginBottom: 4 },
  name: { fontSize: 14 },
  detail: { fontSize: 10, marginTop: 2 },
  qr: { size: 25, marginTop: 6 },
}

/**
 * Build normalized card data that both renderers consume.
 * Single source of truth for display logic (vigencia year, name assembly).
 *
 * @param {Object} opts
 * @param {Object} opts.member - Member data (name, firstName, lastName, slastName, memberSince, expirationDate)
 * @param {Object} opts.images - Renderer-appropriate sources: { logo, photo, qr, background }
 * @returns {{ firstLine: string, lastLine: string, vigenciaYear: number, images: Object }}
 */
export function buildCardData({ member, images }) {
  let vigenciaYear
  if (member.expirationDate) {
    vigenciaYear = new Date(member.expirationDate).getUTCFullYear()
  } else {
    vigenciaYear = new Date().getUTCFullYear()
  }

  // First line: first name (+ middle name if present)
  // Last line: last name (+ second last name if present)
  let firstLine, lastLine
  if (member.firstName) {
    firstLine = [member.firstName, member.middleName].filter(Boolean).join(' ')
    lastLine = [member.lastName, member.slastName].filter(Boolean).join(' ')
  } else if (member.name && member.name !== '-') {
    // Fallback: split full name at first space
    const parts = member.name.split(' ')
    firstLine = parts[0] || ''
    lastLine = parts.slice(1).join(' ')
  } else {
    firstLine = ''
    lastLine = ''
  }

  return {
    firstLine,
    lastLine,
    vigenciaYear,
    images,
  }
}
