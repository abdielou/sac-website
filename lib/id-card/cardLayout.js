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
 * Vertical split: upper two-thirds (y ≤ 162pt) hold the photo and orbital
 * rings; lower third (y ≥ 162pt) holds the QR box and the logo/name/year
 * stack. QR box height matches the info stack so tops and bottoms align.
 */
/** Uniform padding around the whole card — nothing touches the edge. */
const PADDING = 10

export const LAYOUT = {
  paddingHorizontal: PADDING,
  paddingBottom: PADDING,
  // Element (orbital rings) + photo occupy the upper two-thirds.
  element: {
    width: 133, // 153 - 2*PADDING, natural aspect 149.4:163.01 → height ≈ 145
    height: 145,
    top: PADDING,
  },
  photo: {
    size: 100, // slightly larger than element inner ring for a prominent portrait
    top: PADDING + (145 - 100) / 2, // center photo on element
    borderRadius: 50,
  },
  // Bottom row sits in the lower third, starting at y=162pt.
  bottomRow: {
    top: 162,
    gap: 8,
  },
  qrBox: {
    size: 65, // square — matches info stack natural height
    borderRadius: 9,
    padding: 5,
  },
  qr: {
    size: 55,
  },
  infoColumn: {
    logo: { width: 60, height: 23, marginBottom: 1 },
    name: { fontSize: 11, lineHeight: 1.1 },
    yearPill: {
      width: 30,
      height: 14,
      borderRadius: 7,
      marginTop: 3,
      fontSize: 9,
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
