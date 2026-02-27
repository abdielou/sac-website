'use client'

import Image from 'next/image'

/**
 * Browser-rendered ID card preview for the member profile page.
 * Shows the same visual design as the PDF template but using HTML/Tailwind.
 *
 * @param {{ profile: Object }} props - Member profile from useMemberProfile hook
 */
export function IdCardPreview({ profile }) {
  const isActive = profile.status === 'active' || profile.status === 'expiring-soon'

  // Extract vigencia year from expirationDate
  let vigenciaYear
  if (profile.expirationDate) {
    vigenciaYear = new Date(profile.expirationDate).getUTCFullYear()
  } else {
    vigenciaYear = new Date().getUTCFullYear()
  }

  // Build member name
  const memberName =
    `${profile.firstName || ''} ${profile.lastName || ''} ${profile.slastName || ''}`.trim()

  // Photo URL
  const photoUrl = profile.photoFileId
    ? `/api/member/photo/${encodeURIComponent(profile.email)}?v=${profile.photoFileId}`
    : null

  return (
    <div className="space-y-4">
      {/* Card container */}
      <div className="relative max-w-sm mx-auto" style={{ aspectRatio: '3.375 / 2.125' }}>
        <div
          className={`relative w-full h-full rounded-xl shadow-2xl overflow-hidden ${!isActive ? 'opacity-50' : ''}`}
          style={{ backgroundColor: '#221E5A' }}
        >
          {/* Background Saturn pattern */}
          <div className="absolute inset-0 opacity-[0.04]">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%231D1A3D' fill-opacity='0.5'%3E%3Ccircle cx='30' cy='30' r='8'/%3E%3Cellipse cx='30' cy='30' rx='12' ry='2' transform='rotate(-15 30 30)'/%3E%3Cellipse cx='30' cy='30' rx='12' ry='2' transform='rotate(15 30 30)'/%3E%3Cellipse cx='30' cy='30' rx='12' ry='2'/%3E%3Cpath d='M10 10l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M48 10l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M10 48l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M48 48l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M5 5l50 50' stroke='%231D1A3D' stroke-width='1' fill='none'/%3E%3C/g%3E%3C/svg%3E")`,
                backgroundSize: '60px 60px',
                backgroundRepeat: 'repeat',
              }}
            />
          </div>

          {/* DRAFT watermark for inactive members */}
          {!isActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <span className="text-white opacity-30 text-6xl font-bold transform rotate-[-30deg]">
                DRAFT
              </span>
            </div>
          )}

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-between h-full p-4">
            {/* Top: SAC Logo */}
            <div className="flex items-center justify-center">
              <Image
                src="/static/images/sac-white-logo-25.svg"
                alt="SAC Logo"
                width={160}
                height={60}
                className="h-10 w-auto"
              />
            </div>

            {/* Middle: Photo + Name */}
            <div className="flex flex-col items-center">
              {/* Photo */}
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center overflow-hidden mb-2">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt="Foto del miembro"
                    width={64}
                    height={64}
                    className="w-full h-full object-cover rounded-full"
                    unoptimized
                  />
                ) : (
                  <svg className="w-10 h-10 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                )}
              </div>

              {/* Name */}
              <div className="text-white text-sm font-bold text-center leading-tight">
                {memberName}
              </div>
            </div>

            {/* Bottom: Membership info + QR placeholder */}
            <div className="flex items-end justify-between w-full">
              <div className="text-white text-[10px] space-y-0.5">
                <div>Miembro desde {profile.memberSince || '---'}</div>
                <div>
                  Vigencia <span className="underline">{vigenciaYear}</span>
                </div>
              </div>

              {/* QR placeholder */}
              <div className="w-10 h-10 bg-white rounded flex items-center justify-center">
                <span className="text-gray-500 text-[8px] font-bold">QR</span>
              </div>
            </div>
          </div>
        </div>
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
