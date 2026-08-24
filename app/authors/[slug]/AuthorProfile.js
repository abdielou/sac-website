import Image from '@/components/Image'
import Link from '@/components/Link'
import formatDate from '@/lib/utils/formatDate'

/**
 * Author profile body. Server component, so every article link is real markup
 * that a crawler can follow without running JavaScript.
 *
 * Only what data/authors/<slug>.md actually holds is rendered: the name, the
 * board role, the bio and the markdown body. No credential is inferred.
 */
export default function AuthorProfile({ frontMatter = {}, paragraphs = [], articles = [] }) {
  const { name, avatar, occupation, bio } = frontMatter
  const count = articles.length
  const heading = count === 1 ? 'Artículo' : 'Artículos'

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <div className="pt-6 pb-8 space-y-2 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          {name}
        </h1>
        {occupation && (
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">{occupation}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 pl-4 pt-4 pb-4 m-4 bg-gray-50 dark:bg-gray-100 rounded shadow-lg dark:shadow-dark">
        <div className="md:col-span-1">
          {avatar && (
            <Image src={avatar} alt={name} width={192} height={192} className="rounded-full" />
          )}
        </div>
        <div className="md:col-span-3 md:ml-4">
          {bio && <p className="pt-4 text-gray-500 mr-4">{bio}</p>}
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="pt-3 text-gray-500 mr-4">
              {paragraph}
            </p>
          ))}
          <p className="pt-6">
            <Link
              href="/about"
              className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            >
              Conoce a la Junta de Directores
            </Link>
          </p>
        </div>
      </div>

      <div className="pt-8">
        <h2 className="pb-4 text-2xl font-bold leading-8 tracking-tight text-gray-900 dark:text-gray-100">
          {heading} de {name}
        </h2>
        {count === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            Todavía no hay artículos publicados de {name}.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {articles.map((article) => (
              <li key={article.slug} className="py-4">
                <article className="space-y-2 xl:grid xl:grid-cols-4 xl:items-baseline xl:space-y-0">
                  <dl>
                    <dt className="sr-only">Fecha de publicación</dt>
                    <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
                      {article.date && (
                        <time dateTime={article.date}>{formatDate(article.date)}</time>
                      )}
                    </dd>
                  </dl>
                  <div className="space-y-3 xl:col-span-3">
                    <h3 className="text-xl font-bold leading-8 tracking-tight">
                      <Link
                        href={`/blog/${article.slug}`}
                        className="text-gray-900 dark:text-gray-100"
                      >
                        {article.title}
                      </Link>
                    </h3>
                    {article.summary && (
                      <div className="prose text-gray-500 max-w-none dark:text-gray-400">
                        {article.summary}
                      </div>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
