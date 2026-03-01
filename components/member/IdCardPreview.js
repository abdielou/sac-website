'use client'

import { CARD, buildCardData } from '@/lib/id-card/cardLayout'
import { IdCard } from '@/lib/id-card/IdCard'

/**
 * ID card preview for the member profile page.
 * Uses the SAME IdCard component that generates the PDF,
 * rendered with browser DOM elements instead of react-pdf primitives.
 */
export function IdCardPreview({ profile }) {
  const isActive = profile.status === 'active' || profile.status === 'expiring-soon'

  const photoUrl = profile.photoFileId
    ? `/api/member/photo/${encodeURIComponent(profile.email)}?v=${profile.photoFileId}`
    : null

  const cardData = buildCardData({
    member: profile,
    images: {
      logo: '/static/images/sac-white-logo.png',
      photo: photoUrl,
      qr: null,
      background: null,
    },
  })

  return (
    <div className="space-y-4">
      {/* Card container */}
      <div
        className={`relative max-w-sm mx-auto rounded-xl shadow-2xl overflow-hidden ${!isActive ? 'opacity-50' : ''}`}
        style={{ aspectRatio: CARD.ASPECT_RATIO }}
      >
        <IdCard cardData={cardData} />

        {/* DRAFT watermark for inactive members */}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <span className="text-white opacity-30 text-6xl font-bold transform rotate-[-30deg]">
              DRAFT
            </span>
          </div>
        )}
      </div>

      {/* Download button */}
      {isActive ? (
        <div className="text-center">
          <a
            href="/api/member/id-card"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Descargar PDF
          </a>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Disponible cuando tu membresia este activa
        </p>
      )}
    </div>
  )
}
