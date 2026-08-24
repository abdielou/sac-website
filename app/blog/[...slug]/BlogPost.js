import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCodeTitles from '@/lib/remark-code-title'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypePrismPlus from 'rehype-prism-plus'
import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import Image from '@/components/Image'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import { MDXComponents } from '@/components/MDXComponents'

const postDateTemplate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }

const DAY_IN_MS = 24 * 60 * 60 * 1000

const mdxOptions = {
  remarkPlugins: [remarkGfm, remarkCodeTitles, remarkMath],
  rehypePlugins: [
    rehypeSlug,
    rehypeAutolinkHeadings,
    rehypeKatex,
    [rehypePrismPlus, { ignoreMissing: true }],
  ],
}

/** Localized long date, or null when the value is missing or unparsable. */
function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString(siteMetadata.locale, postDateTemplate)
}

/** Whole minutes of reading time, or null when reading-time gave nothing usable. */
function readingMinutes(stats) {
  const minutes = Number(stats?.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return Math.max(1, Math.round(minutes))
}

/**
 * True when the article was really updated after publication.
 * Migrated rows store a bare 'YYYY-MM-DD' lastmod against a T08:00:00Z date, so
 * anything inside one day is noise, not an update.
 */
function isUpdated(date, lastmod) {
  if (!date || !lastmod) return false
  const published = new Date(date).getTime()
  const modified = new Date(lastmod).getTime()
  if (Number.isNaN(published) || Number.isNaN(modified)) return false
  return modified - published > DAY_IN_MS
}

export default function BlogPost({ source, toc, frontMatter, authorDetails, prev, next, related }) {
  const { date, title, tags, lastmod, readingTime } = frontMatter

  const publishedLabel = formatDate(date)
  const updatedLabel = isUpdated(date, lastmod) ? formatDate(lastmod) : null
  const minutes = readingMinutes(readingTime)

  return (
    <SectionContainer>
      <article>
        <div className="xl:divide-y xl:divide-gray-200 xl:dark:divide-gray-700">
          <header className="pt-6 xl:pb-6">
            <nav
              aria-label="Ruta de navegación"
              className="pb-4 text-sm text-gray-500 dark:text-gray-400"
            >
              <ol className="flex flex-wrap items-center justify-center gap-x-2">
                <li>
                  <Link href="/" className="hover:text-primary-600 dark:hover:text-primary-400">
                    Inicio
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/blog" className="hover:text-primary-600 dark:hover:text-primary-400">
                    Artículos
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-gray-700 dark:text-gray-300" aria-current="page">
                  {title}
                </li>
              </ol>
            </nav>
            <div className="space-y-1 text-center">
              <dl className="space-y-10">
                <div>
                  <dt className="sr-only">Publicado en</dt>
                  <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
                    <time dateTime={date}>{publishedLabel}</time>
                    {minutes && <span> &middot; {minutes} min de lectura</span>}
                  </dd>
                  {updatedLabel && (
                    <>
                      <dt className="sr-only">Actualizado en</dt>
                      <dd className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                        <time dateTime={lastmod}>Actualizado el {updatedLabel}</time>
                      </dd>
                    </>
                  )}
                </div>
              </dl>
              <div>
                <PageTitle>{title}</PageTitle>
              </div>
            </div>
          </header>
          <div
            className="pb-8 divide-y divide-gray-200 xl:divide-y-0 dark:divide-gray-700 xl:grid xl:grid-cols-4 xl:gap-x-6"
            style={{ gridTemplateRows: 'auto 1fr' }}
          >
            <dl className="pt-6 pb-10 xl:pt-11 xl:border-b xl:border-gray-200 xl:dark:border-gray-700">
              <dt className="sr-only">Autores</dt>
              <dd>
                <ul className="flex justify-center space-x-8 xl:block sm:space-x-12 xl:space-x-0 xl:space-y-8">
                  {authorDetails.map((author) => (
                    <li className="flex items-center space-x-2" key={author.name}>
                      {author.avatar && (
                        <Image
                          src={author.avatar}
                          width={38}
                          height={38}
                          alt={author.name}
                          className="w-10 h-10 rounded-full"
                        />
                      )}
                      <dl className="text-sm font-medium leading-5 whitespace-nowrap">
                        <dt className="sr-only">Nombre</dt>
                        <dd className="text-gray-900 dark:text-gray-100">
                          {author.slug && author.slug !== 'default' ? (
                            <Link
                              href={`/authors/${author.slug}`}
                              className="hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              {author.name}
                            </Link>
                          ) : (
                            author.name
                          )}
                        </dd>
                        <dt className="sr-only">Twitter</dt>
                        <dd>
                          {author.twitter && (
                            <Link
                              href={author.twitter}
                              className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              {author.twitter.replace('https://twitter.com/', '@')}
                            </Link>
                          )}
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
            <div className="divide-y divide-gray-200 dark:divide-gray-700 xl:pb-0 xl:col-span-3 xl:row-span-2">
              <div className="pt-10 pb-8 prose dark:prose-dark max-w-none">
                <MDXRemote
                  source={source}
                  components={MDXComponents}
                  options={{ mdxOptions, scope: { toc } }}
                />
              </div>
            </div>
            <footer>
              <div className="text-sm font-medium leading-5 divide-gray-200 xl:divide-y dark:divide-gray-700 xl:col-start-1 xl:row-start-2">
                {tags?.length > 0 && (
                  <div className="py-4 xl:py-8">
                    <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                      Etiquetas
                    </h2>
                    <div className="flex flex-wrap">
                      {tags.map((tag) => (
                        <Tag key={tag} text={tag} />
                      ))}
                    </div>
                  </div>
                )}
                {related?.length > 0 && (
                  <div className="py-4 xl:py-8">
                    <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                      Artículos relacionados
                    </h2>
                    <ul className="mt-2 space-y-2">
                      {related.map((post) => (
                        <li key={post.slug}>
                          <Link
                            href={`/blog/${post.slug}`}
                            className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                          >
                            {post.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(next || prev) && (
                  <div className="flex justify-between py-4 xl:block xl:space-y-8 xl:py-8">
                    {prev && (
                      <div>
                        <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          Artículo anterior
                        </h2>
                        <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                          <Link href={`/blog/${prev.slug}`}>{prev.title}</Link>
                        </div>
                      </div>
                    )}
                    {next && (
                      <div>
                        <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          Artículo siguiente
                        </h2>
                        <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                          <Link href={`/blog/${next.slug}`}>{next.title}</Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="pt-4 xl:pt-8">
                <Link
                  href="/blog"
                  className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                >
                  &larr; Volver a los artículos
                </Link>
              </div>
            </footer>
          </div>
        </div>
      </article>
    </SectionContainer>
  )
}
