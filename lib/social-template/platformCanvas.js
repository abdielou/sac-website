/**
 * Canonical social template canvas (3:4).
 * SAC publishes the same image to all platforms — one render, one file.
 */

export const SOCIAL_CANVAS = { width: 1080, height: 1440, label: 'Social 3:4' }

/** @deprecated Use SOCIAL_CANVAS. Kept for backward-compatible imports in tests. */
export const PLATFORM_CANVAS = {
  instagram: SOCIAL_CANVAS,
  facebook: SOCIAL_CANVAS,
  x: SOCIAL_CANVAS,
}

/** @returns {{ width: number, height: number, label: string }} */
export function getSocialCanvas() {
  return SOCIAL_CANVAS
}

/**
 * @deprecated Use getSocialCanvas(). Kept so existing callers compile; returns canonical canvas.
 * @param {string} _platform
 * @returns {{ width: number, height: number, label: string }}
 */
export function getPlatformCanvas(_platform) {
  return SOCIAL_CANVAS
}
