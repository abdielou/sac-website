/**
 * Scale factor applied to every dimension in the card layout so the PDF
 * embeds more raster detail per physical inch. A 4x SCALE quadruples the
 * nominal CR80 size (2.125 × 3.375") to 8.5 × 13.5" of working points —
 * printers or PDF viewers render this back down to the physical card size
 * with 4x the effective DPI.
 *
 * Setting SCALE = 1 returns the nominal 153×243pt output.
 */
const SCALE = 3
const s = (n) => n * SCALE

/** CR80 card dimensions in points (1pt = 1/72 inch), scaled by SCALE. */
export const CARD = {
  WIDTH_PT: s(2.125 * 72),
  HEIGHT_PT: s(3.375 * 72),
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
 * Layout tokens — numeric values in scaled points.
 * Vertical split: upper two-thirds hold the photo and orbital rings;
 * lower third holds the QR box and the logo/name/year stack.
 */
/** Uniform padding around the whole card — nothing touches the edge. */
const PADDING = s(8)

export const LAYOUT = {
  paddingHorizontal: PADDING,
  paddingBottom: PADDING,
  // Element (orbital rings) + photo occupy the upper two-thirds.
  element: {
    width: s(145), // natural aspect 149.4:163.01 → height ≈ 158
    height: s(158),
    top: s(3),
  },
  photo: {
    size: s(108), // prominent portrait framed by the outer ring
    top: s(3 + (158 - 108) / 2), // center photo on element
    borderRadius: s(54),
  },
  // Bottom row sits in the lower third.
  bottomRow: {
    top: s(162),
    gap: s(8),
  },
  qrBox: {
    size: s(65), // square — matches info stack natural height
    borderRadius: s(9),
    padding: s(5),
  },
  qr: {
    size: s(55),
  },
  infoColumn: {
    logo: { width: s(52), height: s(20), marginBottom: s(4) },
    name: { fontSize: s(11), lineHeight: 1.1 },
    yearPill: {
      width: s(30),
      height: s(14),
      borderRadius: s(7),
      marginTop: s(3),
      fontSize: s(9),
    },
  },
}

/**
 * Max square pixel size for profile photos on ID cards.
 * Derived from the rendered photo size with headroom for print; keeps PDF payloads small.
 */
export const ID_CARD_PHOTO_MAX_PX = Math.ceil(LAYOUT.photo.size * 1.6)

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
