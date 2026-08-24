import LayoutWrapper from '@/components/LayoutWrapper'
import { pageMetadata } from '@/lib/seo'
import MembershipContent from './MembershipContent'

export const metadata = pageMetadata({
  title: 'Membresía',
  description:
    'Hazte miembro de la Sociedad de Astronomía del Caribe. La cuota de membresía sufraga los costos de nuestras actividades, y te da acceso a talleres y eventos para socios.',
  path: '/membership',
})

export default function MembershipPage() {
  return (
    <LayoutWrapper>
      <MembershipContent />
    </LayoutWrapper>
  )
}
