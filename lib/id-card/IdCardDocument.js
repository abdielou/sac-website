import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

// CR80 card: 3.375" x 2.125" in points (1pt = 1/72 inch)
const CARD_WIDTH = 3.375 * 72 // 243pt
const CARD_HEIGHT = 2.125 * 72 // 153pt

const styles = StyleSheet.create({
  page: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#221E5A',
    position: 'relative',
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
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 80,
    height: 30,
    marginBottom: 6,
    objectFit: 'contain',
  },
  photo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 4,
  },
  name: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  detail: {
    fontSize: 6,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
  },
  qr: {
    width: 40,
    height: 40,
    marginTop: 4,
  },
})

/**
 * Generate ID card PDF document using @react-pdf/renderer primitives.
 *
 * @param {Object} params
 * @param {Object} params.member - Member data (name, memberSince)
 * @param {string|null} params.photoBase64 - Base64 data URL of member photo
 * @param {string} params.qrDataUrl - Base64 data URL of QR code PNG
 * @param {number|string} params.year - Vigencia year
 * @param {string} params.logoPath - Absolute path to SAC logo PNG
 * @param {string|null} params.backgroundPath - Absolute path to year background PNG (or null)
 * @returns {JSX.Element} @react-pdf/renderer Document element
 */
export function generateIdCardDocument({
  member,
  photoBase64,
  qrDataUrl,
  year,
  logoPath,
  backgroundPath,
}) {
  return (
    <Document>
      <Page size={[CARD_WIDTH, CARD_HEIGHT]} style={styles.page}>
        {backgroundPath && <Image src={backgroundPath} style={styles.background} />}
        <View style={styles.content}>
          <Image src={logoPath} style={styles.logo} />
          {photoBase64 && <Image src={photoBase64} style={styles.photo} />}
          <Text style={styles.name}>{member.name}</Text>
          {member.memberSince && (
            <Text style={styles.detail}>Miembro desde {member.memberSince}</Text>
          )}
          <Text style={styles.detail}>Vigencia {year}</Text>
          {qrDataUrl && <Image src={qrDataUrl} style={styles.qr} />}
        </View>
      </Page>
    </Document>
  )
}
