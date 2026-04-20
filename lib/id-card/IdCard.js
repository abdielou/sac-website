import { CARD, LAYOUT } from './cardLayout'

/** Width available to the name/pill column inside the bottom row. */
const INFO_COLUMN_WIDTH =
  CARD.WIDTH_PT -
  2 * LAYOUT.paddingHorizontal -
  LAYOUT.qrBox.size -
  LAYOUT.bottomRow.gap

/**
 * Estimate the fontSize needed so a bold text fits on one line within maxWidth.
 * Uses a character-width ratio (bold ≈ 0.62em avg) — identical math in browser
 * and react-pdf, so preview and PDF shrink the same way.
 */
function fitFontSize(text, maxWidth, baseSize, minSize = 7, charRatio = 0.62) {
  if (!text) return baseSize
  const estimatedWidth = text.length * charRatio * baseSize
  if (estimatedWidth <= maxWidth) return baseSize
  const scaled = baseSize * (maxWidth / estimatedWidth)
  return Math.max(minSize, Math.floor(scaled * 10) / 10)
}

/**
 * Shared inline styles for the ID card (works in react-pdf and browser DOM).
 */
const styles = {
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: CARD.BG_COLOR,
    position: 'relative',
    overflow: 'hidden',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  element: {
    position: 'absolute',
    top: LAYOUT.element.top,
    left: (CARD.WIDTH_PT - LAYOUT.element.width) / 2,
    width: LAYOUT.element.width,
    height: LAYOUT.element.height,
  },
  photo: {
    position: 'absolute',
    top: LAYOUT.photo.top,
    left: (CARD.WIDTH_PT - LAYOUT.photo.size) / 2,
    width: LAYOUT.photo.size,
    height: LAYOUT.photo.size,
    borderRadius: LAYOUT.photo.borderRadius,
  },
  bottomRow: {
    position: 'absolute',
    left: LAYOUT.paddingHorizontal,
    right: LAYOUT.paddingHorizontal,
    top: LAYOUT.bottomRow.top,
    bottom: LAYOUT.paddingBottom,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  qrBox: {
    width: LAYOUT.qrBox.size,
    height: LAYOUT.qrBox.size,
    flexShrink: 0,
    boxSizing: 'border-box',
    backgroundColor: CARD.QR_BOX_BG,
    borderRadius: LAYOUT.qrBox.borderRadius,
    padding: LAYOUT.qrBox.padding,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    width: LAYOUT.qr.size,
    height: LAYOUT.qr.size,
  },
  infoColumn: {
    height: LAYOUT.qrBox.size, // match QR box so tops and bottoms line up exactly
    flexGrow: 1,
    flexShrink: 1,
    marginLeft: LAYOUT.bottomRow.gap,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  infoColumnTop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  logo: {
    width: LAYOUT.infoColumn.logo.width,
    height: LAYOUT.infoColumn.logo.height,
    marginBottom: LAYOUT.infoColumn.logo.marginBottom,
  },
  firstName: {
    fontFamily: CARD.FONT_FAMILY,
    fontSize: LAYOUT.infoColumn.name.fontSize,
    fontWeight: 'bold',
    color: CARD.NAME_COLOR,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  lastName: {
    fontFamily: CARD.FONT_FAMILY,
    fontSize: LAYOUT.infoColumn.name.fontSize,
    fontWeight: 'bold',
    color: CARD.NAME_COLOR,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    marginTop: 1,
  },
  yearPill: {
    marginTop: LAYOUT.infoColumn.yearPill.marginTop,
    width: LAYOUT.infoColumn.yearPill.width,
    height: LAYOUT.infoColumn.yearPill.height,
    borderRadius: LAYOUT.infoColumn.yearPill.borderRadius,
    backgroundColor: CARD.YEAR_PILL_BG,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  year: {
    fontFamily: CARD.FONT_FAMILY,
    fontSize: LAYOUT.infoColumn.yearPill.fontSize,
    fontWeight: 'bold',
    color: CARD.YEAR_COLOR,
    textAlign: 'center',
  },
}

const BrowserElements = {
  View: (props) => <div {...props} />,
  Text: ({ style, ...rest }) => (
    <span
      style={{
        lineHeight: 1.1,
        display: 'block',
        ...style,
        fontFamily: style?.fontFamily ? CARD.FONT_FAMILY_BROWSER : undefined,
      }}
      {...rest}
    />
  ),
  Image: ({ src, style, ...rest }) => (
    <img src={src} style={{ display: 'block', ...style }} alt="" {...rest} />
  ),
}

/**
 * THE ID card component. Used for browser preview and PDF rendering.
 *
 * @param {Object} props.cardData - { firstLine, lastLine, vigenciaYear, images: { logo, photo, qr, background } }
 * @param {Object} [props.elements] - { View, Text, Image } — defaults to browser DOM elements
 */
export function IdCard({ cardData, elements = BrowserElements }) {
  const { View, Text, Image } = elements
  const { firstLine, lastLine, vigenciaYear, images } = cardData

  const baseNameSize = LAYOUT.infoColumn.name.fontSize
  const firstFontSize = fitFontSize(firstLine, INFO_COLUMN_WIDTH, baseNameSize)
  const lastFontSize = fitFontSize(lastLine, INFO_COLUMN_WIDTH, baseNameSize)

  return (
    <View style={styles.card}>
      {images.background && <Image src={images.background} style={styles.background} />}

      {images.element && <Image src={images.element} style={styles.element} />}

      {images.photo && <Image src={images.photo} style={styles.photo} />}

      <View style={styles.bottomRow}>
        <View style={styles.qrBox}>
          {images.qr && <Image src={images.qr} style={styles.qr} />}
        </View>

        <View style={styles.infoColumn}>
          <View style={styles.infoColumnTop}>
            <Image src={images.logo} style={styles.logo} />
            {firstLine && (
              <Text style={{ ...styles.firstName, fontSize: firstFontSize }}>{firstLine}</Text>
            )}
            {lastLine && (
              <Text style={{ ...styles.lastName, fontSize: lastFontSize }}>{lastLine}</Text>
            )}
          </View>
          <View style={styles.yearPill}>
            <Text style={styles.year}>{vigenciaYear}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export { styles as idCardStyles }
