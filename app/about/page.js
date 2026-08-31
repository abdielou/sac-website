import { getFileBySlug } from '@/lib/mdx'
import LayoutWrapper from '@/components/LayoutWrapper'
import { pageMetadata } from '@/lib/seo'
import AboutContent from './AboutContent'

const BOARD = ['rafael', 'eddie', 'hector', 'francisco', 'luis', 'abdiel']
const BOARD_2021 = ['janethsi', 'nelson', 'hector', 'rafael_2021', 'eddie_2021', 'victor']

export const metadata = pageMetadata({
  title: 'Quiénes Somos',
  description:
    'Conoce la historia de la Sociedad de Astronomía del Caribe y a los miembros de su Junta de Directores, la actual y la del periodo 2021-2024.',
  path: '/about',
})

export default async function AboutPage() {
  const about = await getFileBySlug('authors', ['default'])
  // The slug is carried alongside the file so each profile card can link to its
  // /authors/<slug> page. getFileBySlug does not return it.
  const withSlug = async (slug) => ({ ...(await getFileBySlug('authors', [slug])), slug })
  const authors = await Promise.all(BOARD.map(withSlug))
  const authors_2021 = await Promise.all(BOARD_2021.map(withSlug))

  return (
    <LayoutWrapper>
      <AboutContent about={about} authors={authors} authors_2021={authors_2021} />
    </LayoutWrapper>
  )
}
