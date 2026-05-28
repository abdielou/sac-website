'use client'

import { useRef, useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { CARD, buildFamilyCardData } from '@/lib/id-card/cardLayout'
import { IdCard } from '@/lib/id-card/IdCard'

/**
 * Family member ID card preview. Renders IdCard at exact PDF dimensions,
 * then CSS-scales to fit the parent container.
 */
export function FamilyIdCardPreview({ profile, familyDisplayName }) {
  const isActive = profile.status === 'active' || profile.status === 'expiring-soon'
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!profile.verifyToken) return
    const url = `https://sociedadastronomia.com/verify/${profile.verifyToken}`
    QRCode.toDataURL(url, { width: 800, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [profile.verifyToken])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      const containerWidth = entry.contentRect.width
      setScale(containerWidth / CARD.WIDTH_PT)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const sacEmail = profile.sacEmail || profile.email
  const photoUrl =
    profile.familyPhotoFileId && sacEmail
      ? `/api/member/photo/${encodeURIComponent(sacEmail)}/family/${encodeURIComponent(familyDisplayName)}?photoFileId=${profile.familyPhotoFileId}`
      : null

  const cardData = buildFamilyCardData({
    primaryMember: profile,
    familyDisplayName,
    images: {
      logo: '/static/images/sac-white-logo.png',
      photo: photoUrl,
      qr: qrDataUrl,
      element: '/static/images/sac-id-element.png',
    },
  })

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden shadow-2xl ${!isActive ? 'opacity-50' : ''}`}
      style={{ aspectRatio: CARD.ASPECT_RATIO }}
    >
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
