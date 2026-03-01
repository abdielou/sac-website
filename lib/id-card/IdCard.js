import { CARD, LAYOUT } from './cardLayout'

/**
 * Shared inline styles for the ID card.
 * These work in both react-pdf (points) and browser DOM (pixels).
 * This is THE single source of truth for the card design.
 */
const styles = {
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: CARD.BG_COLOR,
    position: 'relative',
    display: 'flex',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingLeft: LAYOUT.paddingHorizontal,
    paddingRight: LAYOUT.paddingHorizontal,
    paddingTop: LAYOUT.paddingVertical,
    paddingBottom: LAYOUT.paddingVertical,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LAYOUT.logo.width,
    height: LAYOUT.logo.height,
    marginBottom: LAYOUT.logo.marginBottom,
  },
  photo: {
    width: LAYOUT.photo.size,
    height: LAYOUT.photo.size,
    borderRadius: LAYOUT.photo.borderRadius,
    marginBottom: LAYOUT.photo.marginBottom,
  },
  name: {
    fontSize: LAYOUT.name.fontSize,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  detail: {
    fontSize: LAYOUT.detail.fontSize,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: LAYOUT.detail.marginTop,
  },
  qr: {
    width: LAYOUT.qr.size,
    height: LAYOUT.qr.size,
    marginTop: LAYOUT.qr.marginTop,
  },
}

/** Browser DOM elements (default) — reset defaults to match react-pdf rendering */
const BrowserElements = {
  View: (props) => <div {...props} />,
  Text: ({ style, ...rest }) => (
    <span style={{ lineHeight: 1.2, display: 'block', ...style }} {...rest} />
  ),
  Image: ({ src, style, ...rest }) => (
    <img src={src} style={{ display: 'block', ...style }} alt="" {...rest} />
  ),
}

/**
 * THE ID card component. One component, used everywhere:
 * - Browser preview: default elements (div/span/img)
 * - PDF generation: pass react-pdf elements { View, Text, Image }
 *
 * @param {Object} props
 * @param {Object} props.cardData - { name, memberSince, vigenciaYear, images: { logo, photo, qr, background } }
 * @param {Object} [props.elements] - { View, Text, Image } — defaults to browser DOM elements
 */
export function IdCard({ cardData, elements = BrowserElements }) {
  const { View, Text, Image } = elements
  const { name, memberSince, vigenciaYear, images } = cardData

  return (
    <View style={styles.card}>
      {images.background && <Image src={images.background} style={styles.background} />}
      <View style={styles.content}>
        <Image src={images.logo} style={styles.logo} />
        {images.photo && <Image src={images.photo} style={styles.photo} />}
        <Text style={styles.name}>{name}</Text>
        {memberSince && <Text style={styles.detail}>Miembro desde {memberSince}</Text>}
        <Text style={styles.detail}>Vigencia {vigenciaYear}</Text>
        {images.qr && <Image src={images.qr} style={styles.qr} />}
      </View>
    </View>
  )
}

export { styles as idCardStyles }
