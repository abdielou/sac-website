'use client'

import { useState } from 'react'
import { AuthorListTitle, AuthorListLayout, AboutCard } from '@/layouts/AuthorListLayout'

export default function AboutContent({ about, authors, authors_2021 }) {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <>
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
