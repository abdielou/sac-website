import { notFound } from 'next/navigation'
import Link from '@/components/Link'
import LayoutWrapper from '@/components/LayoutWrapper'
import { breadcrumbSchema, jsonLdScript } from '@/lib/seo'
import {
  editionDescription,
  editionItemListSchema,
  editionMetadata,
  editionTitle,
  formatEditionDate,
  getPublishedEdition,
  groupEditionsByType,
  guideTypeConfig,
  listPublishedEditions,
  missingEditionMetadata,
  resolveGuideEntries,
} from '../../api/guides/guide-editions'
import GuideSection from '../GuideSection'

// Same cadence as the guide index — guide data rarely changes.
export const revalidate = 300

// A new edition published after the last build must resolve on first request.
export const dynamicParams = true

export async function generateStaticParams() {
  const editions = await listPublishedEditions()
  return editions.map((edition) => ({ slug: edition.slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const guide = await getPublishedEdition(slug)
  if (!guide) return missingEditionMetadata(slug)
  return editionMetadata(guide)
}

export default async function GuideEditionPage({ params }) {
  const { slug } = await params
  const guide = await getPublishedEdition(slug)
  if (!guide) notFound()

  const entries = resolveGuideEntries(guide)
  const config = guideTypeConfig(guide.type)
  const title = editionTitle(guide)
  const description = editionDescription(guide)
  const published = formatEditionDate(guide.publishedAt)

  // Sibling editions of the same type power the switcher on this page.
  const allEditions = await listPublishedEditions()
  const siblings = groupEditionsByType(allEditions)[config.type] ?? []

  const breadcrumbs = breadcrumbSchema([
    { name: 'Inicio', path: '/' },
    { name: 'Guías de observación', path: '/guides' },
    { name: title, path: `/guides/${guide.slug}` },
  ])
  const itemList = editionItemListSchema(guide, entries)

  return (
    <LayoutWrapper>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }}
      />

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <nav aria-label="Ruta de navegación" className="text-sm">
            <Link href="/guides" className="text-blue-600 dark:text-blue-400 hover:underline">
              Guías de observación
            </Link>
          </nav>
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-5xl md:leading-14">
            {title}
          </h1>
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">{description}</p>
          {published && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Publicada el <time dateTime={guide.publishedAt}>{published}</time>
            </p>
          )}
        </div>

        <div className="py-4">
          <GuideSection
            sectionTitle={config.sectionTitle}
            sectionHref="/guides"
            editions={siblings}
            activeSlug={guide.slug}
            entries={entries}
          />

          {/* Attribution */}
          <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 space-y-1">
            <p>
              Datos del catálogo:{' '}
              <a
                href="https://github.com/mattiaverga/OpenNGC"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                OpenNGC
              </a>{' '}
              (CC BY-SA 4.0). Imágenes a color: ESA/Hubble (
              <a
                href="https://esahubble.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                esahubble.org
              </a>
              , CC BY 4.0). Imágenes en escala de grises:{' '}
              <a
                href="https://skyview.gsfc.nasa.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600 dark:hover:text-gray-300"
              >
                NASA SkyView
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  )
}
