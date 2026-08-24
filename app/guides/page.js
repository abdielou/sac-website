import Link from '@/components/Link'
import LayoutWrapper from '@/components/LayoutWrapper'
import { absUrl, breadcrumbSchema, jsonLdScript, pageMetadata } from '@/lib/seo'
import {
  GUIDE_TYPE_ORDER,
  formatEditionDate,
  getPublishedEdition,
  groupEditionsByType,
  guideTypeConfig,
  listPublishedEditions,
  resolveGuideEntries,
} from '../api/guides/guide-editions'
import GuideSection from './GuideSection'

const PAGE_TITLE = 'Guías de observación'
const PAGE_DESCRIPTION =
  'Guías mensuales y de temporada para observar objetos del cielo profundo desde Puerto Rico y el Caribe, con magnitud, dificultad, equipo recomendado y hora óptima.'

export const metadata = pageMetadata({
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  path: '/guides',
})

// Revalidate the guide index every 5 minutes — guide data rarely changes
export const revalidate = 300

/**
 * Load the newest edition of every type with its objects already resolved, so
 * the current guide renders server-side on the index instead of being fetched
 * by the browser after hydration.
 */
async function loadSections(editions) {
  const grouped = groupEditionsByType(editions)

  return Promise.all(
    GUIDE_TYPE_ORDER.map(async (type) => {
      const typeEditions = grouped[type] ?? []
      const latest = typeEditions[0] ?? null
      const guide = latest ? await getPublishedEdition(latest.slug) : null

      return {
        type,
        config: guideTypeConfig(type),
        editions: typeEditions,
        latest,
        entries: guide ? resolveGuideEntries(guide) : [],
      }
    })
  )
}

export default async function GuidesPage() {
  const editions = await listPublishedEditions()
  const sections = await loadSections(editions)
  const hasGuides = editions.length > 0

  const breadcrumbs = breadcrumbSchema([
    { name: 'Inicio', path: '/' },
    { name: PAGE_TITLE, path: '/guides' },
  ])

  const editionList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: absUrl('/guides'),
    numberOfItems: editions.length,
    itemListElement: editions.map((edition, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: edition.title,
      url: absUrl(edition.path),
    })),
  }

  return (
    <LayoutWrapper>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      {hasGuides && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(editionList) }}
        />
      )}

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            {PAGE_TITLE}
          </h1>
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
            Guías para observar objetos del cielo profundo desde el Caribe. Cada edición tiene su
            propia página con magnitud, dificultad, equipo recomendado y hora óptima.
          </p>
        </div>

        {hasGuides ? (
          <div className="py-4">
            {sections.map((section) => (
              <GuideSection
                key={section.type}
                sectionTitle={section.config.sectionTitle}
                editions={section.editions}
                activeSlug={section.latest?.slug ?? ''}
                entries={section.entries}
              />
            ))}

            {/* Full edition archive — every edition on its own crawlable URL */}
            <section className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Todas las ediciones
              </h2>
              <ul className="mt-4 space-y-3">
                {editions.map((edition) => {
                  const published = formatEditionDate(edition.publishedAt)
                  return (
                    <li key={edition.slug}>
                      <Link
                        href={edition.path}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {edition.title}
                      </Link>
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        {edition.entryCount > 0 && `${edition.entryCount} objetos`}
                        {edition.entryCount > 0 && published && ' · '}
                        {published}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>

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
        ) : (
          <div className="py-12 text-center">
            <p className="text-lg text-gray-500 dark:text-gray-400">
              Próximamente: guías de observación interactivas.
            </p>
          </div>
        )}
      </div>
    </LayoutWrapper>
  )
}
