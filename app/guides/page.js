import LayoutWrapper from '@/components/LayoutWrapper'
import { listGuides } from '@/lib/guides'
import GuideSection from './GuideSection'

export const metadata = {
  title: 'Guias de Observacion - SAC',
  description: 'Guias interactivas para observar objetos del cielo profundo desde Puerto Rico.',
  openGraph: {
    title: 'Guias de Observacion | SAC',
    description: 'Guias interactivas para observar objetos del cielo profundo desde Puerto Rico.',
  },
}

export const dynamic = 'force-dynamic'

export default async function GuidesPage() {
  let galaxyEditions = []
  let objectEditions = []

  try {
    const result = await listGuides()
    const published = result.guides.filter((g) => g.status === 'published')

    const sortDesc = (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)

    galaxyEditions = published
      .filter((g) => g.type === 'galaxies')
      .sort(sortDesc)
      .map((g) => ({
        slug: g.slug,
        title: g.title,
        publishedAt: g.publishedAt,
        entryCount: g.entryCount || 0,
      }))

    objectEditions = published
      .filter((g) => g.type === 'objects')
      .sort(sortDesc)
      .map((g) => ({
        slug: g.slug,
        title: g.title,
        publishedAt: g.publishedAt,
        entryCount: g.entryCount || 0,
      }))
  } catch (error) {
    // S3 not configured or other error — show empty state
    console.error('Error loading guides index:', error.message)
  }

  const hasGuides = galaxyEditions.length > 0 || objectEditions.length > 0

  return (
    <LayoutWrapper>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Guias de Observacion
          </h1>
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
            Guias interactivas para observar objetos del cielo profundo desde Puerto Rico. Filtra
            por equipo, dificultad y ubicacion.
          </p>
        </div>

        {hasGuides ? (
          <div className="py-4">
            <GuideSection
              type="galaxies"
              editions={galaxyEditions}
              sectionTitle="Galaxias de la temporada"
            />
            <GuideSection type="objects" editions={objectEditions} sectionTitle="Objetos del mes" />

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
              Proximamente: guias de observacion interactivas.
            </p>
          </div>
        )}
      </div>
    </LayoutWrapper>
  )
}
