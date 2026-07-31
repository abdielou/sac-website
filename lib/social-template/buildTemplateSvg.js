import { BRAND, TEMPLATE_FONT_FAMILY, getTemplateLayout } from './templateLayouts'
import { estimateTextWidth, fitAndWrapText, wrapText } from './textWrap'

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildTextBlock({
  lines,
  x,
  y,
  fontSize,
  lineHeight,
  color,
  fontWeight,
  anchor = 'start',
  fontStyle = 'normal',
}) {
  if (!lines?.length) return ''
  const dy = fontSize * lineHeight
  const tspans = lines
    .map((line, index) => {
      const offset = index === 0 ? 0 : dy
      return `<tspan x="${x}" dy="${offset}">${escapeXml(line)}</tspan>`
    })
    .join('')
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${anchor}">${tspans}</text>`
}

function buildInfoCard({
  kind,
  label,
  x,
  y,
  width,
  height,
  borderRadius,
  fontSize,
  bg,
  border,
  color,
  fontWeight,
  minFontSize,
  maxLines = 2,
  paddingX = 0,
  stackWords = false,
}) {
  const lineHeight = 1.15
  const text = String(label || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
  const innerWidth = Math.max(1, width - paddingX * 2)
  const effectiveMinFontSize = Math.max(8, Math.min(fontSize, minFontSize || fontSize))
  let fittedFontSize = Math.min(fontSize, height * 0.48)
  let lines = []

  while (fittedFontSize >= effectiveMinFontSize) {
    if (stackWords) {
      const words = text.split(' ').filter(Boolean)
      lines =
        words.length <= maxLines
          ? words
          : [...words.slice(0, maxLines - 1), words.slice(maxLines - 1).join(' ')]
    } else {
      lines = wrapText(text, innerWidth, fittedFontSize, { maxLines })
    }

    const textHeight = fittedFontSize + Math.max(0, lines.length - 1) * fittedFontSize * lineHeight
    const widthFits = lines.every(
      (line) => estimateTextWidth(line.replace(/…$/, ''), fittedFontSize) <= innerWidth
    )
    const heightFits = textHeight <= height * 0.76
    const isTruncated = lines.some((line) => line.endsWith('…'))

    if (widthFits && heightFits && (!isTruncated || fittedFontSize <= effectiveMinFontSize)) {
      break
    }
    fittedFontSize -= 1
  }

  fittedFontSize = Math.max(effectiveMinFontSize, fittedFontSize)
  if (!lines.length) {
    lines = wrapText(text, innerWidth, fittedFontSize, { maxLines })
  }

  const textHeight = fittedFontSize + Math.max(0, lines.length - 1) * fittedFontSize * lineHeight
  const textTop = y + Math.max(0, (height - textHeight) / 2)
  const startY = textTop + fittedFontSize * 0.8
  const textBottom = textTop + textHeight
  const centerX = x + width / 2

  const tspans = lines
    .map((line, index) => {
      const offset = index === 0 ? 0 : fittedFontSize * lineHeight
      return `<tspan x="${centerX}" dy="${offset}">${escapeXml(line)}</tspan>`
    })
    .join('')

  return `<g data-role="info-card" data-kind="${escapeXml(kind)}" data-card-top="${y.toFixed(
    2
  )}" data-card-bottom="${(y + height).toFixed(2)}" data-text-top="${textTop.toFixed(
    2
  )}" data-text-bottom="${textBottom.toFixed(2)}" data-line-count="${
    lines.length
  }" data-font-size="${fittedFontSize.toFixed(2)}">
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${bg}" stroke="${border || 'none'}" stroke-width="${border ? 2 : 0}"/>
  <text x="${centerX}" y="${startY}" fill="${color}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="${fittedFontSize}" font-weight="${fontWeight}" text-anchor="middle">${tspans}</text>
</g>`
}

/**
 * Build a transparent SVG overlay (text, pills, gradient, disclaimer, sponsor label).
 * Logos (SAC + sponsor) are composited separately via sharp.
 *
 * @param {{
 *   layout: string|object,
 *   canvas: { width: number, height: number },
 *   textFields: object,
 *   hasSponsor?: boolean,
 *   sponsorPlacement?: { left: number, top: number, width: number, height: number },
 * }} params
 * @returns {string} SVG markup
 */
export function buildTemplateSvg({
  layout,
  canvas,
  textFields,
  hasSponsor = false,
  sponsorPlacement,
}) {
  const layoutTokens = typeof layout === 'string' ? getTemplateLayout(layout, canvas) : layout
  if (!layoutTokens || !canvas?.width || !canvas?.height) {
    throw new Error('buildTemplateSvg requires layout and canvas')
  }

  const { width, height } = canvas
  const parts = []
  let pillsTop = null

  // Bottom readability gradient
  const g = layoutTokens.gradient
  if (g) {
    const y1 = Math.round(height * g.startYPct)
    parts.push(`<defs>
  <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${BRAND.gradientTransparent}"/>
    <stop offset="100%" stop-color="${BRAND.gradientBottom}"/>
  </linearGradient>
</defs>
<rect x="0" y="${y1}" width="${width}" height="${height - y1}" fill="url(#bottomFade)"/>`)
  }

  const headlineCfg = layoutTokens.headline
  const headlineMaxWidth = width * headlineCfg.maxWidthPct
  const headlineMaxFont = width * headlineCfg.maxFontPctOfWidth
  const headlineMinFont = width * headlineCfg.minFontPctOfWidth
  const { fontSize: headlineSize, lines: headlineLines } = fitAndWrapText(
    textFields.headline,
    headlineMaxWidth,
    headlineMaxFont,
    headlineMinFont,
    { maxLines: headlineCfg.maxLines }
  )
  const headlineX = headlineCfg.centerX ? width / 2 : width * headlineCfg.xPct
  const headlineY = height * headlineCfg.yPct
  parts.push(
    buildTextBlock({
      lines: headlineLines,
      x: headlineX,
      y: headlineY,
      fontSize: headlineSize,
      lineHeight: headlineCfg.lineHeight,
      color: headlineCfg.color,
      fontWeight: headlineCfg.fontWeight,
      anchor: headlineCfg.centerX ? 'middle' : 'start',
    })
  )

  let contentBottomY = headlineY + headlineLines.length * headlineSize * headlineCfg.lineHeight

  if (layoutTokens.subtitle && textFields.subtitle) {
    const sub = layoutTokens.subtitle
    const subMaxWidth = width * sub.maxWidthPct
    const { fontSize: subSize, lines: subLines } = fitAndWrapText(
      textFields.subtitle,
      subMaxWidth,
      width * sub.maxFontPctOfWidth,
      width * sub.minFontPctOfWidth,
      { maxLines: sub.maxLines }
    )
    const subY = contentBottomY + height * sub.yGapAfterHeadlinePct
    const subX = sub.centerX ? width / 2 : width * sub.xPct
    parts.push(
      buildTextBlock({
        lines: subLines,
        x: subX,
        y: subY,
        fontSize: subSize,
        lineHeight: sub.lineHeight,
        color: sub.color,
        fontWeight: sub.fontWeight,
        anchor: sub.centerX ? 'middle' : 'start',
      })
    )
    contentBottomY = subY + subLines.length * subSize * sub.lineHeight
  }

  if (layoutTokens.body && textFields.body) {
    const bodyCfg = layoutTokens.body
    const bodyMaxWidth = width * bodyCfg.maxWidthPct
    const { fontSize: bodySize, lines: bodyLines } = fitAndWrapText(
      textFields.body,
      bodyMaxWidth,
      width * bodyCfg.maxFontPctOfWidth,
      width * bodyCfg.minFontPctOfWidth,
      { maxLines: bodyCfg.maxLines }
    )
    const bodyY = contentBottomY + height * bodyCfg.yGapAfterSubtitlePct
    const bodyX = bodyCfg.centerX ? width / 2 : width * bodyCfg.xPct
    parts.push(
      buildTextBlock({
        lines: bodyLines,
        x: bodyX,
        y: bodyY,
        fontSize: bodySize,
        lineHeight: bodyCfg.lineHeight,
        color: bodyCfg.color,
        fontWeight: bodyCfg.fontWeight,
        anchor: bodyCfg.centerX ? 'middle' : 'start',
      })
    )
    contentBottomY = bodyY + bodyLines.length * bodySize * bodyCfg.lineHeight
  }

  if (layoutTokens.pills) {
    const pillCfg = layoutTokens.pills
    const cards = [
      textFields.dateLabel
        ? {
            kind: 'date',
            label: textFields.dateLabel,
            bg: BRAND.datePillBg,
            color: BRAND.datePillColor,
            border: null,
            stackWords: pillCfg.stackDate,
          }
        : null,
      textFields.timeLabel
        ? {
            kind: 'time',
            label: textFields.timeLabel,
            bg: BRAND.timePillBg,
            color: BRAND.timePillColor,
            border: null,
            stackWords: false,
          }
        : null,
      textFields.locationLabel
        ? {
            kind: 'location',
            label: textFields.locationLabel,
            bg: BRAND.locationPillBg,
            color: BRAND.locationPillColor,
            border: BRAND.locationPillBorder,
            stackWords: false,
          }
        : null,
    ].filter(Boolean)

    if (cards.length) {
      const pillHeight = height * pillCfg.heightPct
      const gap = width * pillCfg.gapPct
      const totalWidth = width * pillCfg.maxWidthPct
      const cardWidth = (totalWidth - gap * (cards.length - 1)) / cards.length
      const startX = (width - totalWidth) / 2
      const y = height - height * pillCfg.yFromBottomPct - pillHeight
      const borderRadius = height * pillCfg.borderRadiusPct
      const fontSize = width * pillCfg.fontPctOfWidth
      const minFontSize = width * pillCfg.minFontPctOfWidth
      const paddingX = width * pillCfg.paddingXPct
      pillsTop = y

      cards.forEach((card, index) => {
        parts.push(
          buildInfoCard({
            kind: card.kind,
            label: card.label,
            x: startX + index * (cardWidth + gap),
            y,
            width: cardWidth,
            height: pillHeight,
            borderRadius,
            fontSize,
            bg: card.bg,
            border: card.border,
            color: card.color,
            fontWeight: 700,
            minFontSize,
            maxLines: pillCfg.maxLines,
            paddingX,
            stackWords: card.stackWords,
          })
        )
      })
    }
  }

  if (layoutTokens.weatherDisclaimer && textFields.weatherDisclaimer) {
    const wd = layoutTokens.weatherDisclaimer
    const fontSize = width * wd.fontPctOfWidth
    const y = height - height * wd.yFromBottomPct
    parts.push(
      buildTextBlock({
        lines: [textFields.weatherDisclaimer],
        x: width * wd.xPct,
        y,
        fontSize,
        lineHeight: 1.2,
        color: wd.color,
        fontWeight: wd.fontWeight,
      })
    )
  }

  if (hasSponsor && layoutTokens.sponsor) {
    const sp = layoutTokens.sponsor
    const fontSize = width * sp.labelFontPctOfWidth
    const fallbackWidth = width * sp.maxWidthPct
    const fallbackHeight = height * sp.maxHeightPct
    const fallbackRight = width - width * sp.xFromRightPct
    const placement = sponsorPlacement || {
      left: fallbackRight - fallbackWidth,
      top: height - height * sp.yFromBottomPct - fallbackHeight,
      width: fallbackWidth,
      height: fallbackHeight,
    }
    const labelX = placement.left + placement.width / 2
    const labelY = placement.top - height * sp.labelGapPct
    parts.push(
      `<g data-role="sponsor-label" data-logo-left="${placement.left.toFixed(
        2
      )}" data-logo-top="${placement.top.toFixed(2)}" data-logo-width="${placement.width.toFixed(
        2
      )}" data-logo-height="${placement.height.toFixed(2)}">${buildTextBlock({
        lines: [sp.label],
        x: labelX,
        y: labelY,
        fontSize,
        lineHeight: 1.2,
        color: BRAND.white,
        fontWeight: 400,
        anchor: 'middle',
        fontStyle: 'italic',
      })}</g>`
    )
  }

  const layoutMetrics = `data-layout-orientation="${layoutTokens.orientation}" data-content-bottom="${contentBottomY.toFixed(
    2
  )}"${pillsTop === null ? '' : ` data-pills-top="${pillsTop.toFixed(2)}"`}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${layoutMetrics}>
${parts.join('\n')}
</svg>`
}
