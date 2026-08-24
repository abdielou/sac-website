import { notFound } from 'next/navigation'
import { getMediaEntry } from '@/lib/media-s3'
import MediaPlayer from '@/components/MediaPlayer'
import LayoutWrapper from '@/components/LayoutWrapper'
import { absoluteImages, noindexMetadata, pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const entry = await getMediaEntry(slug)

  // The page calls notFound() for an unknown slug; keep the 404 head out of the index.
  if (!entry) {
    return noindexMetadata({
      title: 'Video no encontrado',
      description: 'Este video no existe o fue eliminado.',
      path: `/media/${slug}`,
    })
  }

  const images = absoluteImages(entry.thumbnail)
  return pageMetadata({
    title: entry.title,
    description:
      entry.description || `Video de la Sociedad de Astronomía del Caribe: ${entry.title}.`,
    path: `/media/${entry.slug}`,
    openGraph: { type: 'video.other', images },
    twitter: { images },
  })
}

export default async function MediaPage({ params }) {
  const { slug } = await params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    notFound()
  }

  return (
    <LayoutWrapper>
      <div className="max-w-4xl mx-auto py-8">
        <MediaPlayer url={`/media/${entry.slug}`} />

        <div className="mt-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{entry.title}</h1>
          {entry.description && (
            <p className="mt-2 text-gray-600 dark:text-gray-400">{entry.description}</p>
          )}
          <p className="mt-4 text-sm text-gray-500">
            {new Date(entry.publishedAt).toLocaleDateString('es-PR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>
    </LayoutWrapper>
  )
}
