import { AdminProviders } from './providers'

export const metadata = {
  title: 'Admin - SAC',
  description: 'Panel de administracion de la Sociedad de Astronomia del Caribe',
}

export default function AdminLayout({ children }) {
  return (
    <AdminProviders>
      {children}
    </AdminProviders>
  )
}
