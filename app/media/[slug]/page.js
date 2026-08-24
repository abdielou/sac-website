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

  // Kept out of the index by decision. There is no /media index page and nothing
  // public links to a video, so every one of these is an orphan URL. The
  // OpenGraph block is retained so a shared link still previews correctly.
  //
  // Deliberately NOT disallowed in robots.txt: Google has to crawl the page to
  // see the directive. Blocking it there would strand any already-indexed URL.
  const images = absoluteImages(entry.thumbnail)
  const description =
    entry.description || `Video de la Sociedad de Astronomía del Caribe: ${entry.title}.`

  // Built from pageMetadata so the share card keeps its thumbnail, site name and
  // locale, then overridden with the noindex robots block. A shared link should
  // still preview properly even though the URL stays out of the index.
  const base = pageMetadata({
    title: entry.title,
    description,
    path: `/media/${entry.slug}`,
    openGraph: { type: 'video.other', images },
    twitter: { images },
  })

  return {
    ...base,
    robots: noindexMetadata({ path: `/media/${entry.slug}` }).robots,
  }
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
