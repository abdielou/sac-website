'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CARD, buildCardData } from '@/lib/id-card/cardLayout'
import { IdCard } from '@/lib/id-card/IdCard'

/**
 * Preview page for the longest-name worst-case in the sheet.
 * Delete this directory once review is done.
 */
export default function P() {
  const [qr, setQr] = useState(null)
  useEffect(() => {
    QRCode.toDataURL('https://sociedadastronomia.com/verify/test', {
      width: 200,
      margin: 1,
    }).then(setQr)
  }, [])

  const cardData = buildCardData({
    member: {
      firstName: 'Maria de los Angeles',
      lastName: 'Medina',
      slastName: 'Garcia',
      expirationDate: '2026-12-31',
    },
    images: {
      logo: '/static/images/sac-white-logo.png',
      photo: '/static/images/avatar.png',
      qr,
      element: '/static/images/sac-id-element.png',
    },
  })

  const scale = 600 / CARD.WIDTH_PT // display at ~600px wide regardless of SCALE
  return (
    <div style={{ padding: 40, background: '#222', minHeight: '100vh', color: 'white' }}>
      <p style={{ textAlign: 'center', marginBottom: 20, fontSize: 14 }}>
        Longest name in DB: <strong>Maria de los Angeles Medina Garcia</strong>
      </p>
      <div style={{ width: CARD.WIDTH_PT * scale, height: CARD.HEIGHT_PT * scale, margin: '0 auto' }}>
        <div
          style={{
            width: CARD.WIDTH_PT,
            height: CARD.HEIGHT_PT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <IdCard cardData={cardData} />
        </div>
      </div>
    </div>
  )
}
