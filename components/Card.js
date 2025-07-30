import Image from './Image'
import Link from './Link'

const OptimizedImage = ({ alt, imageOptimize, ...rest }) =>
  /* eslint-disable-next-line @next/next/no-img-element */
  imageOptimize ? <Image alt={alt} {...rest} /> : <img alt={alt} {...rest} />

const Card = ({ title, imgSrc, href, width = 1088, height = 612, imageOptimize = true }) => {
  const displayTitle = title
  return (
    <div className="p-2">
      <div className="h-full overflow-hidden border-2 border-gray-200 rounded-md border-opacity-60 dark:border-gray-700">
        {title && (
          <div className="flex items-center justify-center h-6 px-2">
            <h2 className="text-xs font-medium leading-tight text-gray-900 dark:text-gray-100 truncate">
              {displayTitle}
            </h2>
          </div>
        )}
        {href ? (
          <Link href={href} aria-label={`View ${title || 'image'}`}>
            <OptimizedImage
              alt={title}
              src={imgSrc}
              className="object-cover object-center w-full"
              width={width}
              height={height}
              imageOptimize={imageOptimize}
            />
          </Link>
        ) : (
          <OptimizedImage
            alt={title}
            src={imgSrc}
            className="object-cover object-center w-full"
            width={width}
            height={height}
            imageOptimize={imageOptimize}
          />
        )}
      </div>
    </div>
  )
}

export default Card
