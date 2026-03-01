'use client'

import { useRef, useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { CARD, buildCardData } from '@/lib/id-card/cardLayout'
import { IdCard } from '@/lib/id-card/IdCard'

/**
 * ID card preview. Renders the IdCard at exact PDF dimensions (points),
 * then CSS-scales it to fit the parent container — guaranteeing pixel-perfect
 * parity with the PDF output.
 */
export function IdCardPreview({ profile }) {
  const isActive = profile.status === 'active' || profile.status === 'expiring-soon'
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!profile.verifyToken) return
    const url = `https://sociedadastronomia.com/verify/${profile.verifyToken}`
    QRCode.toDataURL(url, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [profile.verifyToken])

  // Measure container and compute scale to fit the card
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      const containerWidth = entry.contentRect.width
      setScale(containerWidth / CARD.WIDTH_PT)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const photoUrl = profile.photoFileId
    ? `/api/member/photo/${encodeURIComponent(profile.email)}?v=${profile.photoFileId}`
    : null

  const vigenciaYear = profile.expirationDate
    ? new Date(profile.expirationDate).getUTCFullYear()
    : new Date().getUTCFullYear()

  const cardData = buildCardData({
    member: profile,
    images: {
      logo: '/static/images/sac-main-logo.png',
      photo: photoUrl,
      qr: qrDataUrl,
      background: `/static/images/id-bg-${vigenciaYear}.png`,
    },
  })

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden shadow-2xl ${!isActive ? 'opacity-50' : ''}`}
      style={{ aspectRatio: CARD.ASPECT_RATIO }}
    >
      {/* Render at exact PDF dimensions, then scale to fit container */}
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

      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <span className="text-white opacity-30 text-6xl font-bold transform rotate-[-30deg]">
            DRAFT
          </span>
        </div>
      )}
    </div>
  )
}
