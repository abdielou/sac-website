import Image from 'next/image'
import { getMemberByEmail } from '../../../lib/google-sheets'

export const metadata = {
  title: 'Verificacion de Membresia - SAC',
  description: 'Verificacion de membresia de la Sociedad de Astronomia del Caribe',
}

// Force dynamic rendering (member status must be fresh)
export const dynamic = 'force-dynamic'

export default async function VerifyMemberPage({ params }) {
  const { email } = await params
  const decodedEmail = decodeURIComponent(email)

  let member = null
  try {
    member = await getMemberByEmail(decodedEmail)
  } catch {
    // If fetch fails, member stays null — handled below
  }

  const isActive = member && (member.status === 'active' || member.status === 'expiring-soon')
  const isInactive = member && (member.status === 'expired' || member.status === 'applied')

  // Extract vigencia year from expiration date
  let vigenciaYear = null
  if (member?.expirationDate) {
    vigenciaYear = new Date(member.expirationDate).getUTCFullYear()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {/* SAC Logo */}
        <div className="mb-6">
          <Image
            src="/static/images/sac-white-logo.png"
            alt="SAC - Sociedad de Astronomia del Caribe"
            width={160}
            height={60}
            className="mx-auto bg-[#221E5A] rounded-lg p-3"
          />
        </div>

        <h1 className="text-xl font-bold text-gray-800 mb-6">Verificacion de Membresia</h1>

        {!member && (
          <div className="bg-gray-100 rounded-xl p-6">
            <div className="text-4xl mb-3">&#10067;</div>
            <p className="text-gray-600 font-medium">No se encontro informacion de membresia</p>
            <p className="text-gray-400 text-sm mt-2">
              Si crees que esto es un error, contacta a SAC.
            </p>
          </div>
        )}

        {isActive && (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
            <div className="text-4xl mb-3">&#9989;</div>
            <p className="text-green-800 font-bold text-lg">{member.name}</p>
            <p className="text-green-700 font-medium mt-2">Miembro activo de SAC</p>
            {vigenciaYear && <p className="text-green-600 text-sm mt-1">Vigencia {vigenciaYear}</p>}
          </div>
        )}

        {isInactive && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
            <div className="text-4xl mb-3">&#9888;&#65039;</div>
            <p className="text-amber-800 font-bold text-lg">{member.name}</p>
            <p className="text-amber-700 font-medium mt-2">Membresia no vigente</p>
            <p className="text-amber-600 text-sm mt-1">Contacta a SAC para renovar tu membresia.</p>
          </div>
        )}

        <p className="text-gray-400 text-xs mt-8">Sociedad de Astronomia del Caribe</p>
      </div>
    </div>
  )
}
