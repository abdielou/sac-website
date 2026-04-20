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

/** Layout tokens — numeric values in points. */
export const LAYOUT = {
  paddingHorizontal: 12,
  paddingBottom: 14,
  element: {
    width: 153, // full card width
    height: 167, // width * (163.01 / 149.4), natural aspect of sac-element
    top: -15,
  },
  photo: {
    size: 96,
    top: 23,
    borderRadius: 48,
  },
  bottomRow: {
    gap: 6,
  },
  qrBox: {
    size: 54,
    borderRadius: 8,
    padding: 5,
  },
  qr: {
    size: 44,
  },
  infoColumn: {
    logo: { width: 62, height: 24, marginBottom: 4 },
    name: { fontSize: 13, lineHeight: 1.1 },
    yearPill: {
      width: 44,
      height: 15,
      borderRadius: 8,
      marginTop: 4,
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
