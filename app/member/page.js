import { auth } from '../../auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Mi Perfil - SAC',
  description: 'Perfil de miembro de la Sociedad de Astronomia del Caribe',
}

export default async function MemberPage() {
  const session = await auth()
  if (!session) {
    redirect('/auth/signin')
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Mi Perfil</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Bienvenido, {session.user?.name || session.user?.email}. Esta pagina estara disponible
        pronto.
      </p>
    </div>
  )
}
