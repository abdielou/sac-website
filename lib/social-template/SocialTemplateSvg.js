import React from 'react'
import { BRAND, TEMPLATE_FONT_FAMILY, getTemplateLayout } from './templateLayouts'
import { estimateTextWidth, fitAndWrapText, wrapText } from './textWrap'

function SvgTextBlock({
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
  if (!lines?.length) return null
  const dy = fontSize * lineHeight

  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontFamily={TEMPLATE_FONT_FAMILY}
      fontSize={fontSize}
      fontWeight={fontWeight}
      fontStyle={fontStyle}
      letterSpacing={letterSpacing}
      textAnchor={anchor}
    >
      {lines.map((line, index) => (
        <tspan key={`${index}-${line}`} x={x} dy={index === 0 ? 0 : dy}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

function InfoCard({
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
  stripSeparators = false,
  showSurface = true,
}) {
  let text = String(label || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (kind === 'location') {
    text = stripSeparators
      ? text.replace(/\s*[,;]\s*/g, ' ').trim()
      : text.replace(/\s*([,;])\s*/g, '$1 ').trim()
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

  return (
    <g
      data-role="info-card"
      data-kind={kind}
      data-card-top={y.toFixed(2)}
      data-card-bottom={(y + height).toFixed(2)}
      data-text-top={textTop.toFixed(2)}
      data-text-bottom={textBottom.toFixed(2)}
      data-line-count={lines.length}
      data-font-size={fittedFontSize.toFixed(2)}
      data-card-left={x.toFixed(2)}
      data-card-width={width.toFixed(2)}
    >
      {showSurface && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={borderRadius}
          ry={borderRadius}
          fill={bg}
          stroke={border || 'none'}
          strokeWidth={border ? 2 : 0}
        />
      )}
      {hasEyebrow && (
        <text
          x={textX}
          y={contentTop + eyebrowFontSize * 0.8}
          fill={BRAND.infoRailLabel}
          fontFamily={TEMPLATE_FONT_FAMILY}
          fontSize={eyebrowFontSize}
          fontWeight={700}
          letterSpacing={eyebrowFontSize * 0.08}
          textAnchor={textAnchor}
        >
          {eyebrow.toUpperCase()}
        </text>
      )}
      <text
        data-role="info-card-value"
        x={textX}
        y={startY}
        fill={color}
        fontFamily={TEMPLATE_FONT_FAMILY}
        fontSize={fittedFontSize}
        fontWeight={fontWeight}
        textAnchor={textAnchor}
      >
        {lines.map((line, index) => (
          <tspan
            key={`${kind}-${index}-${line}`}
            x={textX}
            dy={index === 0 ? 0 : fittedFontSize * lineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function resolveInfoCardWidths(cards, totalWidth, gap, columnWeights = {}) {
  const availableWidth = totalWidth - gap * Math.max(0, cards.length - 1)
  const weights = cards.map((card) => Math.max(0.01, columnWeights[card.kind] || 1))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => (availableWidth * weight) / totalWeight)
}

/**
 * Shared React SVG overlay used by the browser preview and the server serializer.
 * Backgrounds and logos remain separate image layers.
 */
export function SocialTemplateSvg({
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
  const elements = []
  const definitions = []
  let pillsTop = null

  if (fontFaceCss) {
    definitions.push(
      <style key="template-fonts" type="text/css">
        {fontFaceCss}
      </style>
    )
  }

  if (layoutTokens.backgroundWash) {
    elements.push(
      <rect
        key="background-wash"
        x={0}
        y={0}
        width={width}
        height={height}
        fill={layoutTokens.backgroundWash}
      />
    )
  }

  const gradient = layoutTokens.gradient
  if (gradient) {
    const y1 = Math.round(height * gradient.startYPct)
    definitions.push(
      <linearGradient key="bottom-fade" id="bottomFade" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor={BRAND.gradientTransparent} />
        <stop offset="100%" stopColor={BRAND.gradientBottom} />
      </linearGradient>
    )
    elements.push(
      <rect
        key="bottom-gradient"
        x={0}
        y={y1}
        width={width}
        height={height - y1}
        fill="url(#bottomFade)"
      />
    )
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
  elements.push(
    <SvgTextBlock
      key="headline"
      lines={headlineLines}
      x={headlineX}
      y={headlineY}
      fontSize={headlineSize}
      lineHeight={headlineCfg.lineHeight}
      color={headlineCfg.color}
      fontWeight={headlineCfg.fontWeight}
      anchor={headlineCfg.centerX ? 'middle' : 'start'}
    />
  )

  let contentBottomY =
    headlineY + Math.max(0, headlineLines.length - 1) * headlineSize * headlineCfg.lineHeight

  if (layoutTokens.subtitle && textFields.subtitle) {
    const subtitleCfg = layoutTokens.subtitle
    const subtitleMaxWidth = width * subtitleCfg.maxWidthPct
    const { fontSize: subtitleSize, lines: subtitleLines } = fitAndWrapText(
      textFields.subtitle,
      subtitleMaxWidth,
      width * subtitleCfg.maxFontPctOfWidth,
      width * subtitleCfg.minFontPctOfWidth,
      {
        maxLines: subtitleCfg.maxLines,
        charRatio: subtitleCfg.charRatio,
        balanceLines: subtitleCfg.balanceLines,
      }
    )
    const subtitleY = contentBottomY + height * subtitleCfg.yGapAfterHeadlinePct
    const subtitleX = subtitleCfg.centerX ? width / 2 : width * subtitleCfg.xPct
    elements.push(
      <SvgTextBlock
        key="subtitle"
        lines={subtitleLines}
        x={subtitleX}
        y={subtitleY}
        fontSize={subtitleSize}
        lineHeight={subtitleCfg.lineHeight}
        color={subtitleCfg.color}
        fontWeight={subtitleCfg.fontWeight}
        anchor={subtitleCfg.centerX ? 'middle' : 'start'}
      />
    )
    contentBottomY =
      subtitleY + Math.max(0, subtitleLines.length - 1) * subtitleSize * subtitleCfg.lineHeight
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
    elements.push(
      <SvgTextBlock
        key="body"
        lines={bodyLines}
        x={bodyX}
        y={bodyY}
        fontSize={bodySize}
        lineHeight={bodyCfg.lineHeight}
        color={bodyCfg.color}
        fontWeight={bodyCfg.fontWeight}
        anchor={bodyCfg.centerX ? 'middle' : 'start'}
      />
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
            charRatio: pillCfg.locationCharRatio || pillCfg.charRatio,
            preserveCase: pillCfg.locationPreserveCase ?? true,
            stripSeparators: pillCfg.locationStripSeparators || false,
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
        elements.push(
          <g key="info-rail" data-role="info-rail">
            <rect
              x={startX}
              y={y}
              width={totalWidth}
              height={pillHeight}
              rx={borderRadius}
              ry={borderRadius}
              fill={BRAND.infoRailBg}
              stroke={BRAND.infoRailBorder}
              strokeWidth={1.5}
            />
          </g>
        )
      }

      let cardX = startX
      cards.forEach((card, index) => {
        const cardWidth = cardWidths[index]
        elements.push(
          <InfoCard
            key={`info-card-${card.kind}`}
            kind={card.kind}
            label={card.label}
            x={cardX}
            y={y}
            width={cardWidth}
            height={pillHeight}
            borderRadius={borderRadius}
            fontSize={width * (card.fontPctOfWidth || pillCfg.fontPctOfWidth)}
            bg={card.bg}
            border={card.border}
            color={isRail ? BRAND.white : card.color}
            fontWeight={card.fontWeight || 700}
            minFontSize={width * (card.minFontPctOfWidth || pillCfg.minFontPctOfWidth)}
            maxLines={card.maxLines}
            paddingX={paddingX}
            stackWords={card.stackWords}
            lineHeight={pillCfg.lineHeight}
            textHeightRatio={pillCfg.textHeightRatio}
            charRatio={card.charRatio || pillCfg.charRatio}
            eyebrow={isRail ? card.eyebrow : null}
            eyebrowFontSize={eyebrowFontSize}
            eyebrowGap={eyebrowGap}
            paddingY={paddingY}
            align={isRail ? 'start' : 'center'}
            preserveCase={card.preserveCase}
            stripSeparators={card.stripSeparators}
            showSurface={!isRail}
          />
        )
        cardX += cardWidth
        if (isRail && index < cards.length - 1) {
          const dividerX = cardX + gap / 2
          elements.push(
            <line
              key={`info-divider-${card.kind}`}
              data-role="info-divider"
              x1={dividerX}
              y1={y + paddingY}
              x2={dividerX}
              y2={y + pillHeight - paddingY}
              stroke={BRAND.infoRailDivider}
              strokeWidth={1}
            />
          )
        }
        cardX += gap
      })
    }
  }

  if (layoutTokens.weatherDisclaimer && textFields.weatherDisclaimer) {
    const disclaimerCfg = layoutTokens.weatherDisclaimer
    const fontSize = width * disclaimerCfg.fontPctOfWidth
    const y = height - height * disclaimerCfg.yFromBottomPct
    elements.push(
      <SvgTextBlock
        key="weather-disclaimer"
        lines={[textFields.weatherDisclaimer]}
        x={width * disclaimerCfg.xPct}
        y={y}
        fontSize={fontSize}
        lineHeight={1.2}
        color={disclaimerCfg.color}
        fontWeight={disclaimerCfg.fontWeight}
        letterSpacing={width * (disclaimerCfg.letterSpacingPctOfWidth || 0)}
      />
    )
  }

  if (layoutTokens.brandLabel && logoPlacement) {
    const label = layoutTokens.brandLabel
    const fontSize = width * label.fontPctOfWidth
    const labelX = logoPlacement.left + logoPlacement.width + width * label.gapAfterLogoPct
    const labelY = logoPlacement.top + fontSize * 0.78
    elements.push(
      <g key="brand-label" data-role="brand-label">
        <SvgTextBlock
          lines={label.lines}
          x={labelX}
          y={labelY}
          fontSize={fontSize}
          lineHeight={label.lineHeight}
          color={label.color}
          fontWeight={label.fontWeight}
        />
      </g>
    )
  }

  if (hasSponsor && layoutTokens.sponsor) {
    const sponsorCfg = layoutTokens.sponsor
    const fontSize = width * sponsorCfg.labelFontPctOfWidth
    const fallbackWidth = width * sponsorCfg.maxWidthPct
    const fallbackHeight = height * sponsorCfg.maxHeightPct
    const fallbackRight = width - width * sponsorCfg.xFromRightPct
    const placement = sponsorPlacement || {
      left: fallbackRight - fallbackWidth,
      top: height - height * sponsorCfg.yFromBottomPct - fallbackHeight,
      width: fallbackWidth,
      height: fallbackHeight,
    }
    const labelOnLeft = sponsorCfg.labelPosition === 'left'
    const labelX = labelOnLeft
      ? placement.left - width * sponsorCfg.labelGapPct
      : placement.left + placement.width / 2
    const labelY = labelOnLeft
      ? placement.top + placement.height / 2 + fontSize * 0.35
      : placement.top - height * sponsorCfg.labelGapPct
    elements.push(
      <g
        key="sponsor-label"
        data-role="sponsor-label"
        data-logo-left={placement.left.toFixed(2)}
        data-logo-top={placement.top.toFixed(2)}
        data-logo-width={placement.width.toFixed(2)}
        data-logo-height={placement.height.toFixed(2)}
      >
        <SvgTextBlock
          lines={[sponsorCfg.label]}
          x={labelX}
          y={labelY}
          fontSize={fontSize}
          lineHeight={1.2}
          color={BRAND.white}
          fontWeight={sponsorCfg.labelFontWeight || 400}
          anchor={labelOnLeft ? 'end' : 'middle'}
        />
      </g>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-layout-orientation={layoutTokens.orientation}
      data-content-bottom={contentBottomY.toFixed(2)}
      data-pills-top={pillsTop === null ? undefined : pillsTop.toFixed(2)}
    >
      {definitions.length > 0 && <defs>{definitions}</defs>}
      {elements}
    </svg>
  )
}

export default SocialTemplateSvg
