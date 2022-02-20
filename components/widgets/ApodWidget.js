import Image from '@/components/Image'

const ApodWidget = ({ name, title, imgSrc, href, alt }) => (
  <div className="flex flex-col items-center w-48 mb-2 rounded overflow-hidden bg-black">
    <h1 className="my-2 text-gray-200 font-bold">{name}</h1>
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

export default ApodWidget
