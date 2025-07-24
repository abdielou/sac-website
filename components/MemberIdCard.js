import Image from 'next/image'

export default function MemberIdCard({ memberData, formData, photo }) {
  // Display data from form or generated data
  const displayData = memberData?.data || formData
  const displayPhoto = memberData?.photo || photo

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Professional ID Card Design */}
      <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-xl shadow-2xl overflow-hidden border-4 border-white dark:border-gray-800">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-800 to-blue-900 px-4 py-3 text-white">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <h2 className="text-sm font-bold tracking-wide">SOCIEDAD DE ASTRONOMÍA DEL CARIBE</h2>
              <p className="text-xs opacity-90">Identificación de Miembro</p>
            </div>
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
              <span className="text-blue-600 text-lg font-bold">SAC</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 bg-white dark:bg-gray-900">
          <div className="flex items-start space-x-4">
            {/* Photo Section */}
            <div className="flex-shrink-0">
              <div className="w-20 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden flex items-center justify-center">
                {displayPhoto ? (
                  <Image
                    src={displayPhoto}
                    alt="Foto del miembro"
                    width={80}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-gray-400 dark:text-gray-500 text-center">
                    <div className="text-2xl mb-1">
                      <span role="img" aria-label="photo placeholder">
                        📷
                      </span>
                    </div>
                    <div className="text-xs">Foto</div>
                  </div>
                )}
              </div>
            </div>

            {/* Information Section */}
            <div className="flex-1 min-w-0">
              <div className="space-y-2">
                {/* Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Nombre Completo
                  </label>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mt-1">
                    {displayData.firstName && displayData.lastName
                      ? `${displayData.firstName} ${displayData.lastName}`
                      : displayData.firstName || displayData.lastName || 'Nombre del Miembro'}
                  </div>
                </div>

                {/* Member Status */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Estado
                  </label>
                  <div className="flex items-center mt-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Miembro Activo
                    </span>
                  </div>
                </div>

                {/* Member ID (if generated) */}
                {memberData?.id && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      ID de Miembro
                    </label>
                    <div className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-1">
                      {memberData.id}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between text-xs">
            <div className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold">Válido para eventos SAC</span>
            </div>
            <div className="text-blue-600 dark:text-blue-400 font-bold">
              {memberData?.timestamp ? 'Generado' : 'Pendiente'}
            </div>
          </div>
        </div>

        {/* Security Features */}
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full opacity-80"></div>
        </div>
        
        <div className="absolute bottom-2 left-2">
          <div className="w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full opacity-60"></div>
        </div>
      </div>

      {/* Card Instructions */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Esta identificación es válida para eventos y actividades de la SAC
        </p>
      </div>
    </div>
  )
}
