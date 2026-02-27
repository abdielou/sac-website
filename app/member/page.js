import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Mi Cuenta - SAC',
  description: 'Portal de miembro de la Sociedad de Astronomia del Caribe',
}

export default function MemberPage() {
  redirect('/member/profile')
}
