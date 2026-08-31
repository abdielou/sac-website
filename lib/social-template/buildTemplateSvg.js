import React from 'react'
import SocialTemplateSvg from './SocialTemplateSvg'
import { renderSvgToStaticMarkup } from './renderSvgToStaticMarkup'

/**
 * Serialize the shared React SVG overlay for Sharp/librsvg.
 * The signature remains compatible with the previous string builder.
 *
 * @param {{
 *   layout: string|object,
 *   canvas: { width: number, height: number },
 *   textFields: object,
 *   hasSponsor?: boolean,
 *   fontFaceCss?: string,
 *   logoPlacement?: { left: number, top: number, width: number, height: number },
 *   sponsorPlacement?: { left: number, top: number, width: number, height: number },
 * }} params
 * @returns {string} SVG markup
 */
export function buildTemplateSvg(params) {
  const markup = renderSvgToStaticMarkup(React.createElement(SocialTemplateSvg, params))
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`
}
