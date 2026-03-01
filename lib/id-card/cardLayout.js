/** CR80 card dimensions in points (1pt = 1/72 inch) */
export const CARD = {
  WIDTH_PT: 2.125 * 72, // 153
  HEIGHT_PT: 3.375 * 72, // 243
  ASPECT_RATIO: '2.125 / 3.375',
  BG_COLOR: '#221E5A',
}

/** Layout tokens — numeric values in points.
 *  Used directly by react-pdf, converted to px/rem by HTML renderer. */
export const LAYOUT = {
  paddingHorizontal: 12,
  paddingVertical: 20,
  logo: { width: 90, height: 34, marginBottom: 8 },
  photo: { size: 60, borderRadius: 30, marginBottom: 6 },
  name: { fontSize: 12 },
  detail: { fontSize: 7, marginTop: 3 },
  qr: { size: 45, marginTop: 6 },
}

/**
 * Build normalized card data that both renderers consume.
 * Single source of truth for display logic (vigencia year, name assembly).
 *
 * @param {Object} opts
 * @param {Object} opts.member - Member data (name, firstName, lastName, slastName, memberSince, expirationDate)
 * @param {Object} opts.images - Renderer-appropriate sources: { logo, photo, qr, background }
 * @returns {{ name: string, memberSince: string|null, vigenciaYear: number, images: Object }}
 */
export function buildCardData({ member, images }) {
  let vigenciaYear
  if (member.expirationDate) {
    vigenciaYear = new Date(member.expirationDate).getUTCFullYear()
  } else {
    vigenciaYear = new Date().getUTCFullYear()
  }

  const name =
    member.name && member.name !== '-'
      ? member.name
      : `${member.firstName || ''} ${member.lastName || ''} ${member.slastName || ''}`.trim()

  return {
    name,
    memberSince: member.memberSince || null,
    vigenciaYear,
    images,
  }
}
