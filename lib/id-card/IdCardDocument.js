import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { CARD, buildCardData } from './cardLayout'
import { IdCard } from './IdCard'

/** react-pdf element adapters */
const pdfElements = { View, Text, Image }

/**
 * Render a single ID card page for PDF.
 * Uses the shared IdCard component with react-pdf primitives.
 */
export function IdCardPage({ cardData }) {
  return (
    <Page size={[CARD.WIDTH_PT, CARD.HEIGHT_PT]}>
      <IdCard cardData={cardData} elements={pdfElements} />
    </Page>
  )
}

/**
 * Single-card PDF Document. Keeps same signature for generateIdCard.js compatibility.
 */
export function generateIdCardDocument({
  member,
  photoBase64,
  qrDataUrl,
  logoPath,
  backgroundPath,
}) {
  const cardData = buildCardData({
    member,
    images: { logo: logoPath, photo: photoBase64, qr: qrDataUrl, background: backgroundPath },
  })

  return (
    <Document>
      <IdCardPage cardData={cardData} />
    </Document>
  )
}
