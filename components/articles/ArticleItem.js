import Image from '@/components/Image'
import Link from '@/components/Link'
import Tag from '@/components/Tag'
import formatDate from '@/lib/utils/formatDate'

/**
 * The thumbnail sits in one of three grid columns inside SectionContainer:
 * full width below the `sm` breakpoint, about a third of 768px up to `xl`, and
 * about a third of 1024px from `xl`.
 */
export const THUMBNAIL_SIZES = '(max-width: 640px) 100vw, (min-width: 1280px) 341px, 256px'

/**
 * @param {boolean} isFirst The first item on /blog and /blog/page/N is the LCP
 *   element of the hub pages Google crawls to reach the articles, so it must be
 *   fetched eagerly instead of lazily. Every other item stays lazy.
 */
const ArticleItem = ({
  date,
  slug,
  title,
  tags,
  summary,
  images,
  imgWidth,
  imgHeight,
  isFirst = false,
}) => (
  <article>
    <div className="grid sm:grid-cols-3">
      <div className="">
        {images && images.length > 0 && imgWidth && imgHeight && (
          <Link href={`/blog/${slug}`}>
            <Image
              className="rounded-t-sm"
              src={images[0].startsWith('http') ? images[0] : `/${images[0]}`}
              alt={title}
              width={imgWidth}
              height={imgHeight}
              sizes={THUMBNAIL_SIZES}
              priority={isFirst}
              fetchPriority={isFirst ? 'high' : undefined}
            />
          </Link>
        )}
        <dl>
          <dt className="sr-only">Publicado en</dt>
          <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
            <time dateTime={date}>{formatDate(date)}</time>
          </dd>
        </dl>
      </div>
      <div className="sm:col-span-2 mt-3 sm:mt-0 sm:ml-6">
        <div className="">
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
            Ver más &rarr;
          </Link>
        </div>
      </div>
    </div>
  </article>
)

export default ArticleItem
