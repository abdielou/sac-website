import { getMediaEntry } from '@/lib/media-s3'
import MediaPlayer from '@/components/MediaPlayer'
import LayoutWrapper from '@/components/LayoutWrapper'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const entry = await getMediaEntry(slug)
  if (!entry) {
    return { title: 'Video no encontrado' }
  }
  return {
    title: entry.title,
    description: entry.description || null,
  }
}

export default async function MediaPage({ params }) {
  const { slug } = await params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return (
      <LayoutWrapper>
        <div className="max-w-4xl mx-auto py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Video no encontrado</h1>
          <p className="text-gray-500">Este video no existe o fue eliminado.</p>
        </div>
      </LayoutWrapper>
    )
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
