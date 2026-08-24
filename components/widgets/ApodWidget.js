import Image from '@/components/Image'

const ApodWidget = ({ name, title, imgSrc, href, alt }) => (
  <div className="flex flex-col items-center w-48 mb-2 rounded overflow-hidden bg-black">
    {/* h2, not h1: these widgets sit on the home page, whose single h1 names the
        organisation. Three competing h1s left the page with no stated subject. */}
    <h2 className="my-2 text-gray-200 font-bold">{name}</h2>
    <div className="flex flex-col items-center">
      <div className="relative w-26 h-26">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Image alt={alt} src={imgSrc} fill unoptimized style={{ objectFit: 'contain' }} />
          </a>
        ) : (
          <Image alt={alt} src={imgSrc} fill unoptimized style={{ objectFit: 'contain' }} />
        )}
      </div>
      <div className="text-xs text-left">{title}</div>
    </div>
  </div>
)

export default ApodWidget
