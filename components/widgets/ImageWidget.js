'use client'

import { useState } from 'react'
import Image from '@/components/Image'

const ImageWidget = ({ name, imgSrc, fallbackSrc, href, width, height }) => {
  const [src, setSrc] = useState(imgSrc)
  const [failed, setFailed] = useState(false)

  const handleError = () => {
    if (src === imgSrc && fallbackSrc) {
      setSrc(fallbackSrc)
    } else {
      setFailed(true)
    }
  }

  if (failed) return null

  return (
    <div className="flex flex-col items-center w-48 mb-2 rounded overflow-hidden bg-black">
      <h1 className="my-2 text-gray-200 font-bold">{name}</h1>
      <div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Image
              alt={name}
              src={src}
              width={width}
              height={height}
              unoptimized
              onError={handleError}
            />
          </a>
        ) : (
          <Image
            alt={name}
            src={src}
            width={width}
            height={height}
            unoptimized
            onError={handleError}
          />
        )}
      </div>
    </div>
  )
}

export default ImageWidget
