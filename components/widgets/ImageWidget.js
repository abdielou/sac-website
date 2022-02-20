import Image from '@/components/Image'

const ImageWidget = ({ name, imgSrc, href, width, height }) => (
  <div className="flex flex-col items-center w-48 mb-2 rounded overflow-hidden bg-black">
    <h1 className="my-2 text-gray-200 font-bold">{name}</h1>
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

export default ImageWidget
