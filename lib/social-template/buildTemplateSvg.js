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
  letterSpacing = 0,
}) {
  if (!lines?.length) return ''
  const dy = fontSize * lineHeight
  const tspans = lines
    .map((line, index) => {
      const offset = index === 0 ? 0 : dy
      return `<tspan x="${x}" dy="${offset}">${escapeXml(line)}</tspan>`
    })
    .join('')
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" letter-spacing="${letterSpacing}" text-anchor="${anchor}">${tspans}</text>`
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
  splitLongWords = false,
  lineHeight = 1.15,
  textHeightRatio = 0.76,
  charRatio = 0.55,
}) {
  let text = String(label || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (kind === 'location') {
    text = text.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const innerWidth = Math.max(1, width - paddingX * 2)
  const effectiveMinFontSize = Math.max(8, Math.min(fontSize, minFontSize || fontSize))
  let fittedFontSize = Math.min(fontSize, height * 0.48)
  let lines = []

  while (fittedFontSize >= effectiveMinFontSize) {
    const words = text
      .split(' ')
      .filter(Boolean)
      .flatMap((word) => {
        // The reference intentionally treats eight-letter place names as two
        // compact rows (PITAHAYA -> PITA / HAYA). Longer names are allowed to
        // shrink and wrap naturally instead of being split into fragments.
        if (!splitLongWords || word.length !== 8) return [word]
        const midpoint = Math.ceil(word.length / 2)
        return [word.slice(0, midpoint), word.slice(midpoint)]
      })
    const preparedText = words.join(' ')

    if (stackWords) {
      lines =
        words.length <= maxLines
          ? words
          : [...words.slice(0, maxLines - 1), words.slice(maxLines - 1).join(' ')]
    } else {
      lines = wrapText(preparedText, innerWidth, fittedFontSize, { maxLines, charRatio })
    }

    const textHeight = fittedFontSize + Math.max(0, lines.length - 1) * fittedFontSize * lineHeight
    const widthFits = lines.every(
      (line) => estimateTextWidth(line.replace(/…$/, ''), fittedFontSize, charRatio) <= innerWidth
    )
    const heightFits = textHeight <= height * textHeightRatio
    const isTruncated = lines.some((line) => line.endsWith('…'))

    if (widthFits && heightFits && (!isTruncated || fittedFontSize <= effectiveMinFontSize)) {
      break
    }
    fittedFontSize -= 1
  }

  fittedFontSize = Math.max(effectiveMinFontSize, fittedFontSize)
  if (!lines.length) {
    lines = wrapText(text, innerWidth, fittedFontSize, { maxLines, charRatio })
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
 *   fontFaceCss?: string,
 *   logoPlacement?: { left: number, top: number, width: number, height: number },
 *   sponsorPlacement?: { left: number, top: number, width: number, height: number },
 * }} params
 * @returns {string} SVG markup
 */
export function buildTemplateSvg({
  layout,
  canvas,
  textFields,
  hasSponsor = false,
  fontFaceCss = '',
  logoPlacement,
  sponsorPlacement,
}) {
  const layoutTokens = typeof layout === 'string' ? getTemplateLayout(layout, canvas) : layout
  if (!layoutTokens || !canvas?.width || !canvas?.height) {
    throw new Error('buildTemplateSvg requires layout and canvas')
  }

  const { width, height } = canvas
  const parts = []
  let pillsTop = null

  const definitions = []
  if (fontFaceCss) {
    definitions.push(`<style type="text/css">${fontFaceCss}</style>`)
  }

  // A uniform wash brings bright stock/AI backdrops into the reference's
  // near-black tonal range without destroying their star detail.
  if (layoutTokens.backgroundWash) {
    parts.push(
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${layoutTokens.backgroundWash}"/>`
    )
  }

  // Bottom readability gradient
  const g = layoutTokens.gradient
  if (g) {
    const y1 = Math.round(height * g.startYPct)
    definitions.push(`
  <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${BRAND.gradientTransparent}"/>
    <stop offset="100%" stop-color="${BRAND.gradientBottom}"/>
  </linearGradient>`)
    parts.push(
      `<rect x="0" y="${y1}" width="${width}" height="${height - y1}" fill="url(#bottomFade)"/>`
    )
  }
  if (definitions.length) {
    parts.unshift(`<defs>${definitions.join('\n')}</defs>`)
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
    {
      maxLines: headlineCfg.maxLines,
      charRatio: headlineCfg.charRatio,
      balanceLines: headlineCfg.balanceLines,
    }
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

  let contentBottomY =
    headlineY + Math.max(0, headlineLines.length - 1) * headlineSize * headlineCfg.lineHeight

  if (layoutTokens.subtitle && textFields.subtitle) {
    const sub = layoutTokens.subtitle
    const subMaxWidth = width * sub.maxWidthPct
    const { fontSize: subSize, lines: subLines } = fitAndWrapText(
      textFields.subtitle,
      subMaxWidth,
      width * sub.maxFontPctOfWidth,
      width * sub.minFontPctOfWidth,
      {
        maxLines: sub.maxLines,
        charRatio: sub.charRatio,
        balanceLines: sub.balanceLines,
      }
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
    contentBottomY = subY + Math.max(0, subLines.length - 1) * subSize * sub.lineHeight
  }

  if (layoutTokens.body && textFields.body) {
    const bodyCfg = layoutTokens.body
    const bodyMaxWidth = width * bodyCfg.maxWidthPct
    const { fontSize: bodySize, lines: bodyLines } = fitAndWrapText(
      textFields.body,
      bodyMaxWidth,
      width * bodyCfg.maxFontPctOfWidth,
      width * bodyCfg.minFontPctOfWidth,
      {
        maxLines: bodyCfg.maxLines,
        charRatio: bodyCfg.charRatio,
        balanceLines: bodyCfg.balanceLines,
      }
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
    contentBottomY = bodyY + Math.max(0, bodyLines.length - 1) * bodySize * bodyCfg.lineHeight
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
            fontWeight: pillCfg.dateFontWeight,
            maxLines: pillCfg.dateMaxLines || pillCfg.maxLines,
          }
        : null,
      textFields.timeLabel
        ? {
            kind: 'time',
            label: textFields.timeLabel,
            bg: BRAND.timePillBg,
            color: BRAND.timePillColor,
            border: null,
            stackWords: pillCfg.stackTime,
            fontWeight: pillCfg.timeFontWeight,
            maxLines: pillCfg.timeMaxLines || pillCfg.maxLines,
          }
        : null,
      textFields.locationLabel
        ? {
            kind: 'location',
            label: textFields.locationLabel,
            bg: BRAND.locationPillBg,
            color: BRAND.locationPillColor,
            border: BRAND.locationPillBorder,
            stackWords: pillCfg.stackLocation,
            fontWeight: pillCfg.locationFontWeight,
            maxLines: pillCfg.locationMaxLines || pillCfg.maxLines,
            splitLongWords: pillCfg.splitLongLocationWords,
            minFontPctOfWidth: pillCfg.locationMinFontPctOfWidth || pillCfg.minFontPctOfWidth,
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
            fontWeight: card.fontWeight || 700,
            minFontSize: width * (card.minFontPctOfWidth || pillCfg.minFontPctOfWidth),
            maxLines: card.maxLines,
            paddingX,
            stackWords: card.stackWords,
            splitLongWords: card.splitLongWords,
            lineHeight: pillCfg.lineHeight,
            textHeightRatio: pillCfg.textHeightRatio,
            charRatio: pillCfg.charRatio,
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
        letterSpacing: width * (wd.letterSpacingPctOfWidth || 0),
      })
    )
  }

  if (layoutTokens.brandLabel && logoPlacement) {
    const label = layoutTokens.brandLabel
    const fontSize = width * label.fontPctOfWidth
    const labelX = logoPlacement.left + logoPlacement.width + width * label.gapAfterLogoPct
    const labelY = logoPlacement.top + fontSize * 0.78
    parts.push(
      `<g data-role="brand-label">${buildTextBlock({
        lines: label.lines,
        x: labelX,
        y: labelY,
        fontSize,
        lineHeight: label.lineHeight,
        color: label.color,
        fontWeight: label.fontWeight,
      })}</g>`
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
    const labelOnLeft = sp.labelPosition === 'left'
    const labelX = labelOnLeft
      ? placement.left - width * sp.labelGapPct
      : placement.left + placement.width / 2
    const labelY = labelOnLeft
      ? placement.top + placement.height / 2 + fontSize * 0.35
      : placement.top - height * sp.labelGapPct
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
        fontWeight: sp.labelFontWeight || 400,
        anchor: labelOnLeft ? 'end' : 'middle',
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
