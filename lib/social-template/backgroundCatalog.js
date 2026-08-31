/**
 * Stock backgrounds for the social template compositor.
 * Client-safe (no Node builtins). Adding a new entry = drop a file + one object here.
 */

export const STOCK_BACKGROUNDS = [
  {
    id: 'telescope-nebula',
    label: 'Telescopio y nebulosa',
    fileName: 'telescope-nebula.jpg',
    suitableContentTypes: null, // all template-eligible types
  },
  {
    id: 'moon-diagrams',
    label: 'Luna y diagramas',
    fileName: 'moon-diagrams.jpg',
    suitableContentTypes: null,
  },
  {
    id: 'palms-milky-way',
    label: 'Palmeras y Vía Láctea',
    fileName: 'palms-milky-way.jpg',
    suitableContentTypes: null,
  },
]

/**
 * Client-safe picker options (public URL thumbnails).
 * @returns {{ id: string, label: string, thumbnailUrl: string }[]}
 */
export function listBackgroundOptions() {
  return STOCK_BACKGROUNDS.map((bg) => ({
    id: bg.id,
    label: bg.label,
    thumbnailUrl: `/static/social-templates/backgrounds/${bg.fileName}`,
  }))
}

/**
 * @param {string} backgroundId
 * @returns {(typeof STOCK_BACKGROUNDS)[number] | null}
 */
export function getBackgroundById(backgroundId) {
  return STOCK_BACKGROUNDS.find((bg) => bg.id === backgroundId) || null
}
