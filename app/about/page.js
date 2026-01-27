import { getFileBySlug } from '@/lib/mdx'
import LayoutWrapper from '@/components/LayoutWrapper'
import AboutContent from './AboutContent'

const BOARD = ['rafael', 'eddie', 'hector', 'francisco', 'luis', 'abdiel']
const BOARD_2021 = ['janethsi', 'nelson', 'hector', 'rafael_2021', 'eddie_2021', 'victor']

export const metadata = {
  title: 'Quienes Somos',
  description: 'Conoce al equipo de la Sociedad de Astronomia del Caribe',
  openGraph: {
    title: 'Quienes Somos | SAC',
    description: 'Conoce al equipo de la Sociedad de Astronomia del Caribe',
  },
}

export default async function AboutPage() {
  const about = await getFileBySlug('authors', ['default'])
  const authors = await Promise.all(BOARD.map((slug) => getFileBySlug('authors', [slug])))
  const authors_2021 = await Promise.all(BOARD_2021.map((slug) => getFileBySlug('authors', [slug])))

  return (
    <LayoutWrapper>
      <AboutContent about={about} authors={authors} authors_2021={authors_2021} />
    </LayoutWrapper>
  )
}
