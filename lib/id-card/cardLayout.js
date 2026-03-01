/** CR80 card dimensions in points (1pt = 1/72 inch) */
export const CARD = {
  WIDTH_PT: 3.375 * 72, // 243
  HEIGHT_PT: 2.125 * 72, // 153
  ASPECT_RATIO: '3.375 / 2.125',
  BG_COLOR: '#221E5A',
}

/** Layout tokens — numeric values in points.
 *  Used directly by react-pdf, converted to px/rem by HTML renderer. */
export const LAYOUT = {
  padding: 12,
  logo: { width: 80, height: 30, marginBottom: 6 },
  photo: { size: 50, borderRadius: 25, marginBottom: 4 },
  name: { fontSize: 10 },
  detail: { fontSize: 6, marginTop: 2 },
  qr: { size: 40, marginTop: 4 },
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
