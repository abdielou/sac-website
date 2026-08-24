import LayoutWrapper from '@/components/LayoutWrapper'
import { pageMetadata } from '@/lib/seo'
import DonateContent from './DonateContent'

export const metadata = pageMetadata({
  title: 'Donaciones',
  description:
    'Haz un donativo por ATH Móvil o PayPal a la Sociedad de Astronomía del Caribe, una organización sin fines de lucro 501(c)(3). Tu aportación sostiene actividades educativas y noches de observación gratuitas en Puerto Rico.',
  path: '/donate',
})

export default function DonatePage() {
  return (
    <LayoutWrapper>
      <DonateContent />
    </LayoutWrapper>
  )
}
