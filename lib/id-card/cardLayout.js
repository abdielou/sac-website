/** CR80 card dimensions in points (1pt = 1/72 inch) */
export const CARD = {
  WIDTH_PT: 2.125 * 72, // 153
  HEIGHT_PT: 3.375 * 72, // 243
  ASPECT_RATIO: '2.125 / 3.375',
  BG_COLOR: '#581248',
  NAME_COLOR: '#FFFFFF',
  YEAR_COLOR: '#FFFFFF',
  YEAR_PILL_BG: '#1B1751',
  QR_BOX_BG: '#FFFFFF',
  FONT_FAMILY: 'Gilroy',
  FONT_FAMILY_BROWSER: "'Open Sans', 'Gilroy', sans-serif",
}

/**
 * Layout tokens — numeric values in points.
 * Vertical split: upper half of the card (y ≤ ~121.5) holds the photo and
 * orbital rings; lower half holds the QR, logo, name, and year pill.
 */
export const LAYOUT = {
  paddingHorizontal: 12,
  paddingBottom: 16,
  // Element (orbital rings) + photo occupy the upper half.
  element: {
    width: 120, // natural aspect 149.4:163.01 → height ≈ 131
    height: 131,
    top: -8, // slight overhang above card so outer dots peek past top edge
  },
  photo: {
    size: 77, // ~64% of element width = inner ring diameter
    top: 19,
    borderRadius: 38.5,
  },
  // Bottom row spans the lower half (top edge ~= 130pt).
  bottomRow: {
    top: 130,
    gap: 8,
  },
  qrBox: {
    size: 72,
    borderRadius: 10,
    padding: 6,
  },
  qr: {
    size: 60,
  },
  infoColumn: {
    logo: { width: 78, height: 30, marginBottom: 5 },
    name: { fontSize: 15, lineHeight: 1.1 },
    yearPill: {
      width: 52,
      height: 18,
      borderRadius: 9,
      marginTop: 5,
      fontSize: 10,
    },
  },
}

/**
 * Build normalized card data that both renderers consume.
 */
export function buildCardData({ member, images }) {
  let vigenciaYear
  if (member.expirationDate) {
    vigenciaYear = new Date(member.expirationDate).getUTCFullYear()
  } else {
    vigenciaYear = new Date().getUTCFullYear()
  }

  let firstLine, lastLine
  if (member.firstName) {
    firstLine = [member.firstName, member.middleName].filter(Boolean).join(' ')
    lastLine = [member.lastName, member.slastName].filter(Boolean).join(' ')
  } else if (member.name && member.name !== '-') {
    const parts = member.name.split(' ')
    firstLine = parts[0] || ''
    lastLine = parts.slice(1).join(' ')
  } else {
    firstLine = ''
    lastLine = ''
  }

  return { firstLine, lastLine, vigenciaYear, images }
}
