import { Document } from '@react-pdf/renderer'
import { IdCardPage } from './IdCardDocument'

/**
 * Multi-page PDF Document containing one ID card per page.
 * Uses the shared IdCard component via IdCardPage.
 */
export function BulkIdCardDocument({ cards, logoPath, backgroundPath }) {
  return (
    <Document>
      {cards.map((card, index) => (
        <IdCardPage
          key={index}
          cardData={{
            name: card.member.name,
            memberSince: card.member.memberSince,
            vigenciaYear: card.year,
            images: {
              logo: logoPath,
              photo: card.photoBase64,
              qr: card.qrDataUrl,
              background: backgroundPath,
            },
          }}
        />
      ))}
    </Document>
  )
}
