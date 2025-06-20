import Image from './Image'
import Link from './Link'

const OptimizedImage = ({ alt, imageOptimize, ...rest }) =>
  /* eslint-disable-next-line @next/next/no-img-element */
  imageOptimize ? <Image alt={alt} {...rest} /> : <img alt={alt} {...rest} />

const Card = ({
  title,
  description,
  imgSrc,
  href,
  width = 1088,
  height = 612,
  imageOptimize = true,
}) => (
  <div className="p-4">
    <div className="h-full overflow-hidden border-2 border-gray-200 rounded-md border-opacity-60 dark:border-gray-700">
      <div className="p-6">
        <h2 className="mb-3 text-2xl font-bold leading-8 tracking-tight">
          {href ? (
            <Link href={href} aria-label={`Link to ${title}`}>
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        <p className="mb-3 prose text-gray-500 max-w-none dark:text-gray-400">{description}</p>
      </div>
      {href ? (
        <Link href={href} aria-label={`Link to ${title}`}>
          <OptimizedImage
            alt={title}
            src={imgSrc}
            className="object-cover object-center"
            width={width}
            height={height}
            imageOptimize={imageOptimize}
          />
        </Link>
      ) : (
        <OptimizedImage
          alt={title}
          src={imgSrc}
          className="object-cover object-center"
          width={width}
          height={height}
          imageOptimize={imageOptimize}
        />
      )}
    </div>
  </div>
)

export default Card
