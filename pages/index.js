import useSWR from 'swr'
import Link from '@/components/Link'
import { PageSEO } from '@/components/SEO'
import Tag from '@/components/Tag'
import NewsletterForm from '@/components/NewsletterForm'
import Image from '@/components/Image'
import { getAllFilesFrontMatter } from '@/lib/mdx'
import formatDate from '@/lib/utils/formatDate'
import siteMetadata from '@/data/siteMetadata'

const MAX_DISPLAY = 5
const APOD_URL = '/api/apod'
const fetcher = (url) => fetch(url).then((res) => res.json())

export async function getStaticProps() {
  const posts = await getAllFilesFrontMatter('blog')

  return { props: { posts } }
}

export default function Home({ posts }) {
  const { data: apod, error: apodError } = useSWR(APOD_URL, fetcher)
  return (
    <>
      <PageSEO title={siteMetadata.title} description={siteMetadata.description} />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {/* Site Description */}
        <div className="pt-6 pb-8 space-y-2 md:space-y-5">
          <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
            {siteMetadata.description}
          </p>
        </div>

        <div className="flex flex-wrap">
          {/* Blog list */}
          <ul className="w-full md:w-2/3 xl:w-3/4 divide-y divide-gray-200 dark:divide-gray-700">
            {!posts.length && 'No posts found.'}
            {posts.slice(0, MAX_DISPLAY).map((frontMatter) => {
              return (
                <li key={frontMatter.slug} className="py-12">
                  <ArticleItem {...frontMatter} />
                </li>
              )
            })}
          </ul>

          {/* Widgets */}
          <div className="w-full md:w-1/3 xl:w-1/4 mt-2">
            <div className="flex flex-col items-center md:items-end">
              <ImageWidget
                name="Manchas Solares"
                imgSrc="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_HMIIC.jpg"
                href="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_HMIIC.jpg"
                width="2048"
                height="2048"
              />
              <ImageWidget
                name="Prominencias Solares"
                imgSrc="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_0304.jpg"
                href="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_0304.jpg"
                width="2048"
                height="2048"
              />
              {apod && !apodError && <ApodWidget name="APOD" {...apod} />}
              <ImageWidget
                name="Fase Lunar"
                imgSrc="https://www.moonmodule.com/cs/dm/vn.gif"
                href="https://www.moonconnection.com"
                width="192"
                height="294"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {posts.length > MAX_DISPLAY && (
        <div className="flex justify-end text-base font-medium leading-6">
          <Link
            href="/blog"
            className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            aria-label="all posts"
          >
            Todos los artículos &rarr;
          </Link>
        </div>
      )}

      {/* Newsletter Form */}
      {siteMetadata.newsletter.provider && (
        <div className="flex items-center justify-center pt-4">
          <NewsletterForm />
        </div>
      )}
    </>
  )
}

function ArticleItem({ date, slug, title, tags, summary }) {
  return (
    <article>
      <div className="space-y-2 xl:grid xl:grid-cols-4 xl:space-y-0 xl:items-baseline">
        <dl>
          <dt className="sr-only">Published on</dt>
          <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
            <time dateTime={date}>{formatDate(date)}</time>
          </dd>
        </dl>
        <div className="space-y-5 xl:col-span-3">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold leading-8 tracking-tight">
                <Link href={`/blog/${slug}`} className="text-gray-900 dark:text-gray-100">
                  {title}
                </Link>
              </h2>
              <div className="flex flex-wrap">
                {tags.map((tag) => (
                  <Tag key={tag} text={tag} />
                ))}
              </div>
            </div>
            <div className="prose text-gray-500 max-w-none dark:text-gray-400">{summary}</div>
          </div>
          <div className="text-base font-medium leading-6">
            <Link
              href={`/blog/${slug}`}
              className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
              aria-label={`Read "${title}"`}
            >
              Read more &rarr;
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

function ImageWidget({ name, imgSrc, href, width, height }) {
  return (
    <div className="flex flex-col items-center w-48 mb-2 rounded overflow-hidden bg-black">
      <h1 className="my-2">{name}</h1>
      <div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Image alt={name} src={imgSrc} width={width} height={height} />
          </a>
        ) : (
          <Image alt={name} src={imgSrc} width={width} height={height} />
        )}
      </div>
    </div>
  )
}

function ApodWidget({ name, title, imgSrc, href, alt }) {
  return (
    <div className="flex flex-col items-center w-48 mb-2 rounded overflow-hidden bg-black">
      <h1 className="my-2">{name}</h1>
      <div className="flex flex-col items-center">
        <div className="w-26">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Image alt={alt} src={imgSrc} width="100%" height="100%" objectFit="contain" />
            </a>
          ) : (
            <Image alt={alt} src={imgSrc} width="100%" height="100%" objectFit="contain" />
          )}
        </div>
        <div className="text-xs text-left">{title}</div>
      </div>
    </div>
  )
}
