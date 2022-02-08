import { getFileBySlug } from '@/lib/mdx'
import { PageSEO } from '@/components/SEO'
import AuthorListLayout from '@/layouts/AuthorListLayout'

const AUTHORS = ['janethsi', 'nelson', 'hector', 'rafael', 'eddie', 'victor']

export async function getStaticProps() {
  return {
    props: {
      about: await getFileBySlug('authors', ['default']),
      authors: await Promise.all(AUTHORS.map((slug) => getFileBySlug('authors', [slug]))),
    },
  }
}

export default function About({ about, authors }) {
  return (
    <>
      <PageSEO title={`Quiénes Somos`} description={`Quiénes Somos`} />
      <AuthorListLayout about={about} authors={authors} />
    </>
  )
}
