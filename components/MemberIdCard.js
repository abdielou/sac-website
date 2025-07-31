import Image from 'next/image'

export default function MemberIdCard({ memberData, formData, photo }) {
  // Display data from form or generated data
  const displayData = memberData?.data || formData
  const displayPhoto = memberData?.photo || photo

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Member ID Card - EXACT replica of reference image */}
      <div
        className="relative rounded-xl shadow-2xl overflow-hidden border-2 h-[500px]"
        style={{ backgroundColor: '#221E5A', borderColor: '#221E5A' }}
      >
        {/* Background Pattern - Exact Saturn pattern from image */}
        <div className="absolute inset-0 opacity-4">
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%231D1A3D' fill-opacity='0.5'%3E%3C!-- Saturn planet with rings --%3E%3Ccircle cx='30' cy='30' r='8'/%3E%3C!-- Three elliptical rings --%3E%3Cellipse cx='30' cy='30' rx='12' ry='2' transform='rotate(-15 30 30)'/%3E%3Cellipse cx='30' cy='30' rx='12' ry='2' transform='rotate(15 30 30)'/%3E%3Cellipse cx='30' cy='30' rx='12' ry='2'/%3E%3C!-- Four stars in corners --%3E%3Cpath d='M10 10l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M48 10l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M10 48l2 2 2-2-2-2-2 2z'/%3E%3Cpath d='M48 48l2 2 2-2-2-2-2 2z'/%3E%3C!-- Diagonal line --%3E%3Cpath d='M5 5l50 50' stroke='%231D1A3D' stroke-width='1' fill='none'/%3E%3C/g%3E%3C/svg%3E")`,
              backgroundSize: '60px 60px',
              backgroundRepeat: 'repeat',
            }}
          ></div>
        </div>
        {/* Watermark overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <span className="text-white opacity-20 text-[130px] transform rotate-45">DRAFT</span>
        </div>
        {/* Content overlay */}
        <div className="relative z-10 p-6 text-center text-white">
          {/* SAC Logo - Official logo */}
          <div className="mb-8">
            <div className="flex items-center justify-center mb-3">
              <Image
                src="/static/images/sac-white-logo-25.svg"
                alt="SAC Logo"
                width={200}
                height={80}
                className="h-16 w-auto"
              />
            </div>
          </div>

          {/* Photo Section - EXACT circular frame with landscape placeholder */}
          <div className="w-32 h-32 bg-white rounded-full mx-auto mb-6 flex items-center justify-center overflow-hidden">
            {displayPhoto ? (
              <Image
                src={displayPhoto}
                alt="Foto del miembro"
                width={128}
                height={128}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-b from-blue-200 to-green-200 rounded-full flex flex-col items-center justify-center">
                {/* Sky with cloud */}
                <div className="w-full h-1/2 bg-blue-200 relative">
                  <div className="absolute top-2 left-1/2 transform -translate-x-1/2 text-blue-400 text-lg">
                    <span role="img" aria-label="cloud">
                      ☁️
                    </span>
                  </div>
                </div>
                {/* Hills */}
                <div className="w-full h-1/2 bg-gradient-to-b from-green-300 to-green-400 relative">
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-green-500 rounded-t-full"></div>
                  <div className="absolute bottom-0 left-0 w-full h-1/3 bg-green-600 rounded-t-full"></div>
                </div>
              </div>
            )}
          </div>

          {/* Member Details - EXACT text styling from reference image */}
          <div className="mb-3">
            <div className="text-white text-2xl font-bold">{displayData.firstName || 'Nombre'}</div>
            <div className="text-white text-2xl font-bold">
              {displayData.lastName || 'Apellido'}
            </div>
          </div>

          {/* Membership Details - EXACT text from reference image */}
          <div className="space-y-1 text-white text-xs">
            <div>Miembro desde 2016</div>
            <div>
              Vigencia <span className="underline">2025</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
