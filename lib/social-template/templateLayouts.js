/**
 * Layout tokens for social template overlays.
 * Brand colors from app/brand/page.js (Tyrian Purple, Russian Violet, Wisteria, Tumbleweed).
 */

export const BRAND = {
  primary: '#560647', // Tyrian Purple
  secondary: '#1B1751', // Russian Violet
  wisteria: '#C8ABDB',
  tumbleweed: '#EDB898',
  white: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.88)',
  pillBg: 'rgba(27, 23, 81, 0.82)',
  pillBorder: 'rgba(200, 171, 219, 0.45)',
  datePillBg: '#FFFFFF',
  datePillColor: '#560647',
  timePillBg: '#560647',
  timePillColor: '#FFFFFF',
  locationPillBg: 'rgba(0,0,0,0.72)',
  locationPillBorder: 'rgba(255,255,255,0.85)',
  locationPillColor: '#FFFFFF',
  gradientBottom: 'rgba(11, 8, 28, 0.78)',
  gradientTransparent: 'rgba(11, 8, 28, 0)',
}

/** Safe sans-serif for sharp/librsvg (Gilroy TTFs not reliably embedded). */
export const TEMPLATE_FONT_FAMILY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * Relative layout tokens (fractions of canvas width/height unless noted).
 * Absolute px values are derived at render time from the platform canvas.
 *
 * Portrait and landscape need different vertical rhythm. In particular, using
 * width-derived type sizes inside height-derived cards caused the landscape
 * Facebook/X cards to overflow.
 */
export const LAYOUTS = {
  event: {
    id: 'event',
    headline: {
      xPct: 0.08,
      yPct: 0.36,
      maxWidthPct: 0.84,
      maxFontPctOfWidth: 0.07,
      minFontPctOfWidth: 0.038,
      lineHeight: 1.12,
      maxLines: 2,
      color: BRAND.white,
      fontWeight: 700,
      textAnchor: 'middle',
      centerX: true,
    },
    subtitle: {
      xPct: 0.08,
      yGapAfterHeadlinePct: 0.02,
      maxWidthPct: 0.84,
      maxFontPctOfWidth: 0.028,
      minFontPctOfWidth: 0.02,
      lineHeight: 1.3,
      maxLines: 2,
      color: BRAND.textMuted,
      fontWeight: 400,
      centerX: true,
    },
    body: {
      xPct: 0.08,
      yGapAfterSubtitlePct: 0.025,
      maxWidthPct: 0.84,
      maxFontPctOfWidth: 0.022,
      minFontPctOfWidth: 0.016,
      lineHeight: 1.4,
      maxLines: 3,
      color: BRAND.textMuted,
      fontWeight: 400,
      centerX: true,
    },
    pills: {
      xPct: 0.08,
      yFromBottomPct: 0.22,
      gapPct: 0.018,
      heightPct: 0.1,
      paddingXPct: 0.018,
      borderRadiusPct: 0.012,
      fontPctOfWidth: 0.023,
      minFontPctOfWidth: 0.014,
      maxLines: 3,
      stackDate: true,
      equalWidth: true,
      maxWidthPct: 0.84,
    },
    logo: {
      maxWidthPct: 0.22,
      maxHeightPct: 0.065,
      xPct: 0.07,
      yFromBottomPct: 0.095,
    },
    weatherDisclaimer: {
      xPct: 0.08,
      yFromBottomPct: 0.045,
      fontPctOfWidth: 0.016,
      color: 'rgba(255,255,255,0.75)',
      fontWeight: 400,
    },
    sponsor: {
      label: 'Auspicia',
      labelFontPctOfWidth: 0.016,
      maxWidthPct: 0.16,
      maxHeightPct: 0.06,
      xFromRightPct: 0.07,
      yFromBottomPct: 0.095,
      labelGapPct: 0.012,
    },
    gradient: {
      startYPct: 0.5,
      endYPct: 1,
    },
    variants: {
      landscape: {
        headline: {
          yPct: 0.25,
          maxWidthPct: 0.88,
          maxFontPctOfWidth: 0.047,
          minFontPctOfWidth: 0.03,
        },
        subtitle: {
          maxWidthPct: 0.82,
          maxFontPctOfWidth: 0.022,
          minFontPctOfWidth: 0.016,
          yGapAfterHeadlinePct: 0.018,
        },
        pills: {
          yFromBottomPct: 0.23,
          gapPct: 0.015,
          heightPct: 0.12,
          borderRadiusPct: 0.018,
          fontPctOfWidth: 0.018,
          minFontPctOfWidth: 0.012,
          maxLines: 2,
          maxWidthPct: 0.88,
          stackDate: false,
        },
        logo: {
          maxWidthPct: 0.17,
          maxHeightPct: 0.08,
          xPct: 0.06,
          yFromBottomPct: 0.08,
        },
        weatherDisclaimer: {
          xPct: 0.06,
          yFromBottomPct: 0.035,
          fontPctOfWidth: 0.012,
        },
        sponsor: {
          labelFontPctOfWidth: 0.012,
          maxWidthPct: 0.14,
          maxHeightPct: 0.075,
          xFromRightPct: 0.06,
          yFromBottomPct: 0.08,
          labelGapPct: 0.01,
        },
        gradient: {
          startYPct: 0.38,
        },
      },
    },
  },
  simple: {
    id: 'simple',
    headline: {
      xPct: 0.08,
      yPct: 0.38,
      maxWidthPct: 0.84,
      maxFontPctOfWidth: 0.068,
      minFontPctOfWidth: 0.036,
      lineHeight: 1.15,
      maxLines: 4,
      color: BRAND.white,
      fontWeight: 700,
    },
    logo: {
      maxWidthPct: 0.18,
      maxHeightPct: 0.055,
      xPct: 0.08,
      yFromBottomPct: 0.06,
    },
    gradient: {
      startYPct: 0.5,
      endYPct: 1,
    },
    variants: {
      landscape: {
        headline: {
          yPct: 0.32,
          maxFontPctOfWidth: 0.05,
          minFontPctOfWidth: 0.028,
          maxLines: 3,
        },
        logo: {
          maxWidthPct: 0.15,
          maxHeightPct: 0.075,
          xPct: 0.06,
          yFromBottomPct: 0.06,
        },
        gradient: {
          startYPct: 0.38,
        },
      },
    },
  },
}

export const TEMPLATE_LAYOUT_BY_CONTENT_TYPE = {
  observation_night: 'event',
  event_promotion: 'event',
  image_post: 'simple',
  regular_post: 'simple',
  carousel: 'simple',
  educational_astronomy: 'simple',
  member_update: 'simple',
  // caption / reel_caption: no template (text-only / no image path)
}

/**
 * @param {string} contentType
 * @returns {'event' | 'simple' | null}
 */
export function resolveTemplateLayoutId(contentType) {
  return TEMPLATE_LAYOUT_BY_CONTENT_TYPE[contentType] || null
}

/**
 * @param {{ width?: number, height?: number }} canvas
 * @returns {'portrait' | 'landscape'}
 */
export function resolveCanvasOrientation(canvas) {
  return Number(canvas?.width) > Number(canvas?.height) ? 'landscape' : 'portrait'
}

function mergeLayoutVariant(layout, orientation) {
  const { variants: _variants, ...base } = layout
  const variant = layout.variants?.[orientation] || {}
  const merged = { ...base, orientation }

  for (const [key, value] of Object.entries(variant)) {
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(base[key] || {}), ...value }
        : value
  }

  return merged
}

/**
 * @param {string} layoutId
 * @param {{ width?: number, height?: number }} [canvas]
 * @returns {object | null}
 */
export function getTemplateLayout(layoutId, canvas) {
  const layout = LAYOUTS[layoutId]
  if (!layout) return null
  return mergeLayoutVariant(layout, resolveCanvasOrientation(canvas))
}
