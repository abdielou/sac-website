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
  lineHeight = 1.15,
  textHeightRatio = 0.76,
  charRatio = 0.55,
  eyebrow,
  eyebrowFontSize = 0,
  eyebrowGap = 0,
  paddingY = 0,
  align = 'center',
  preserveCase = false,
  showSurface = true,
}) {
  let text = String(label || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (kind === 'location') {
    text = text.replace(/\s*([,;])\s*/g, '$1 ').trim()
  }
  if (!preserveCase) text = text.toUpperCase()
  const innerWidth = Math.max(1, width - paddingX * 2)
  const hasEyebrow = Boolean(eyebrow && eyebrowFontSize)
  const eyebrowHeight = hasEyebrow ? eyebrowFontSize + eyebrowGap : 0
  const valueHeight = Math.max(1, height - paddingY * 2 - eyebrowHeight)
  const effectiveMinFontSize = Math.max(8, Math.min(fontSize, minFontSize || fontSize))
  let fittedFontSize = Math.min(fontSize, valueHeight * 0.48)
  let lines = []

  while (fittedFontSize >= effectiveMinFontSize) {
    const words = text.split(' ').filter(Boolean)
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
    const heightFits = textHeight <= valueHeight * textHeightRatio
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
  const contentTop = y + paddingY
  const valueTop = contentTop + eyebrowHeight
  const textTop = valueTop + Math.max(0, (valueHeight - textHeight) / 2)
  const startY = textTop + fittedFontSize * 0.8
  const textBottom = textTop + textHeight
  const textX = align === 'start' ? x + paddingX : x + width / 2
  const textAnchor = align === 'start' ? 'start' : 'middle'

  const tspans = lines
    .map((line, index) => {
      const offset = index === 0 ? 0 : fittedFontSize * lineHeight
      return `<tspan x="${textX}" dy="${offset}">${escapeXml(line)}</tspan>`
    })
    .join('')

  return `<g data-role="info-card" data-kind="${escapeXml(kind)}" data-card-top="${y.toFixed(
    2
  )}" data-card-bottom="${(y + height).toFixed(2)}" data-text-top="${textTop.toFixed(
    2
  )}" data-text-bottom="${textBottom.toFixed(2)}" data-line-count="${
    lines.length
  }" data-font-size="${fittedFontSize.toFixed(2)}" data-card-left="${x.toFixed(
    2
  )}" data-card-width="${width.toFixed(2)}">
  ${
    showSurface
      ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${bg}" stroke="${border || 'none'}" stroke-width="${border ? 2 : 0}"/>`
      : ''
  }
  ${
    hasEyebrow
      ? `<text x="${textX}" y="${contentTop + eyebrowFontSize * 0.8}" fill="${
          BRAND.infoRailLabel
        }" font-family="${TEMPLATE_FONT_FAMILY}" font-size="${eyebrowFontSize}" font-weight="700" letter-spacing="${
          eyebrowFontSize * 0.08
        }" text-anchor="${textAnchor}">${escapeXml(eyebrow.toUpperCase())}</text>`
      : ''
  }
  <text x="${textX}" y="${startY}" fill="${color}" font-family="${TEMPLATE_FONT_FAMILY}" font-size="${fittedFontSize}" font-weight="${fontWeight}" text-anchor="${textAnchor}">${tspans}</text>
</g>`
}

function resolveInfoCardWidths(cards, totalWidth, gap, columnWeights = {}) {
  const availableWidth = totalWidth - gap * Math.max(0, cards.length - 1)
  const weights = cards.map((card) => Math.max(0.01, columnWeights[card.kind] || 1))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => (availableWidth * weight) / totalWeight)
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
            eyebrow: 'Fecha',
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
            eyebrow: 'Hora',
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
            eyebrow: 'Lugar',
            label: textFields.locationLabel,
            bg: BRAND.locationPillBg,
            color: BRAND.locationPillColor,
            border: BRAND.locationPillBorder,
            stackWords: pillCfg.stackLocation,
            fontWeight: pillCfg.locationFontWeight,
            maxLines: pillCfg.locationMaxLines || pillCfg.maxLines,
            minFontPctOfWidth: pillCfg.locationMinFontPctOfWidth || pillCfg.minFontPctOfWidth,
            fontPctOfWidth: pillCfg.locationFontPctOfWidth || pillCfg.fontPctOfWidth,
            preserveCase: true,
          }
        : null,
    ].filter(Boolean)

    if (cards.length) {
      const pillHeight = height * pillCfg.heightPct
      const gap = width * pillCfg.gapPct
      const totalWidth = width * pillCfg.maxWidthPct
      const cardWidths = resolveInfoCardWidths(cards, totalWidth, gap, pillCfg.columnWeights)
      const startX = (width - totalWidth) / 2
      const y = height - height * pillCfg.yFromBottomPct - pillHeight
      const borderRadius = height * pillCfg.borderRadiusPct
      const paddingX = width * pillCfg.paddingXPct
      const paddingY = height * (pillCfg.paddingYPct || 0)
      const eyebrowFontSize = width * (pillCfg.labelFontPctOfWidth || 0)
      const eyebrowGap = height * (pillCfg.labelGapPct || 0)
      const isRail = pillCfg.presentation === 'rail'
      pillsTop = y

      if (isRail) {
        parts.push(`<g data-role="info-rail">
  <rect x="${startX}" y="${y}" width="${totalWidth}" height="${pillHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${BRAND.infoRailBg}" stroke="${BRAND.infoRailBorder}" stroke-width="1.5"/>
</g>`)
      }

      let cardX = startX
      cards.forEach((card, index) => {
        const cardWidth = cardWidths[index]
        parts.push(
          buildInfoCard({
            kind: card.kind,
            label: card.label,
            x: cardX,
            y,
            width: cardWidth,
            height: pillHeight,
            borderRadius,
            fontSize: width * (card.fontPctOfWidth || pillCfg.fontPctOfWidth),
            bg: card.bg,
            border: card.border,
            color: isRail ? BRAND.white : card.color,
            fontWeight: card.fontWeight || 700,
            minFontSize: width * (card.minFontPctOfWidth || pillCfg.minFontPctOfWidth),
            maxLines: card.maxLines,
            paddingX,
            stackWords: card.stackWords,
            lineHeight: pillCfg.lineHeight,
            textHeightRatio: pillCfg.textHeightRatio,
            charRatio: pillCfg.charRatio,
            eyebrow: isRail ? card.eyebrow : null,
            eyebrowFontSize,
            eyebrowGap,
            paddingY,
            align: isRail ? 'start' : 'center',
            preserveCase: card.preserveCase,
            showSurface: !isRail,
          })
        )
        cardX += cardWidth
        if (isRail && index < cards.length - 1) {
          const dividerX = cardX + gap / 2
          parts.push(
            `<line data-role="info-divider" x1="${dividerX}" y1="${
              y + paddingY
            }" x2="${dividerX}" y2="${y + pillHeight - paddingY}" stroke="${
              BRAND.infoRailDivider
            }" stroke-width="1"/>`
          )
        }
        cardX += gap
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
