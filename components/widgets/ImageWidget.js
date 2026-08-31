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
      {/* h2, not h1: these widgets sit on the home page, whose single h1 names the
          organisation. Three competing h1s left the page with no stated subject. */}
      <h2 className="my-2 text-gray-200 font-bold">{name}</h2>
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
