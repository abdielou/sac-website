import Link from '@/components/Link'
import LayoutWrapper from '@/components/LayoutWrapper'

/**
 * Site-wide 404 for the App Router.
 *
 * Seven routes call notFound() (articles, tags, media, guides, authors, blog
 * pagination). Without this file every one of them renders Next's built-in
 * English page on a Spanish site, with no header, no footer and no way back.
 * pages/404.js does NOT cover them: it is Pages Router only.
 */
export const metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <LayoutWrapper>
      <div className="flex flex-col items-start justify-start gap-6 py-16 md:items-center md:justify-center md:py-24">
        <p className="text-6xl font-extrabold leading-none text-sac-primary-blue dark:text-gray-100 md:text-8xl">
          404
        </p>
        <h1 className="text-2xl font-bold leading-normal md:text-3xl">Página no encontrada</h1>
        <p className="max-w-md text-gray-600 dark:text-gray-400 md:text-center">
          La página que buscas no existe o fue movida. Puede que el enlace esté desactualizado.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-sac-primary-blue hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Ir al inicio
          </Link>
          <Link
            href="/blog"
            className="px-4 py-2 text-sm font-medium border rounded-lg border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Ver artículos
          </Link>
        </div>
      </div>
    </LayoutWrapper>
  )
}
