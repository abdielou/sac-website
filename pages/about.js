import { useState } from 'react'
import { getFileBySlug } from '@/lib/mdx'
import { PageSEO } from '@/components/SEO'
import { AuthorListTitle, AuthorListLayout, AboutCard } from '@/layouts/AuthorListLayout'

const BOARD = ['rafael', 'eddie', 'hector', 'francisco', 'luis', 'abdiel']
const BOARD_2021 = ['janethsi', 'nelson', 'hector', 'rafael_2021', 'eddie_2021', 'victor']

export async function getStaticProps() {
  return {
    props: {
      about: await getFileBySlug('authors', ['default']),
      authors: await Promise.all(BOARD.map((slug) => getFileBySlug('authors', [slug]))),
      authors_2021: await Promise.all(BOARD_2021.map((slug) => getFileBySlug('authors', [slug]))),
    },
  }
}

export default function About({ about, authors, authors_2021 }) {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <>
      <PageSEO title={`Quiénes Somos`} description={`Quiénes Somos`} />
      <AboutCard {...about} />
      <AuthorListTitle title="Junta de Directores" />

      <div className="mb-8">
        <div className="flex space-x-4 border-b">
          <button
            onClick={() => setActiveTab(0)}
            className={`px-4 py-2 ${
              activeTab === 0
                ? 'border-b-2 border-primary-500 text-primary-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Actual
          </button>
          <button
            onClick={() => setActiveTab(1)}
            className={`px-4 py-2 ${
              activeTab === 1
                ? 'border-b-2 border-primary-500 text-primary-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Junta 2021-2024
          </button>
        </div>
        <div className="mt-4">
          {activeTab === 0 ? (
            <AuthorListLayout authors={authors} />
          ) : (
            <AuthorListLayout authors={authors_2021} />
          )}
        </div>
      </div>
    </>
  )
}
