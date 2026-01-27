'use client'

import useSWR from 'swr'
import Link from '@/components/Link'
import ArticleItem from '@/components/articles/ArticleItem'
import ImageWidget from '@/components/widgets/ImageWidget'
import ApodWidget from '@/components/widgets/ApodWidget'
import NewsletterForm from '@/components/NewsletterForm'
import siteMetadata from '@/data/siteMetadata'

const MAX_DISPLAY = 5
const APOD_URL = '/api/apod'
const fetcher = (url) => fetch(url).then((res) => res.json())

export default function HomeContent({ posts }) {
  const { data: apod, error: apodError } = useSWR(APOD_URL, fetcher)

  return (
    <>
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
            {posts.slice(0, MAX_DISPLAY).map((frontMatter) => (
              <li key={frontMatter.slug} className="py-12">
                <ArticleItem {...frontMatter} />
              </li>
            ))}
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
              <ImageWidget
                name="Fase Lunar"
                imgSrc="https://www.moonmodule.com/cs/dm/vn.gif"
                href="https://www.moonconnection.com"
                width="192"
                height="294"
              />
              {apod && !apodError && <ApodWidget name="APOD" {...apod} />}
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

      {/* Newsletter Form - only if provider configured */}
      {siteMetadata.newsletter.provider && (
        <div className="flex items-center justify-center pt-4">
          <NewsletterForm />
        </div>
      )}
    </>
  )
}
