import React from 'react'
import Masonry from 'react-masonry-css'
import Card from '@/components/Card'

export default function GalleryGrid({ images, onSelect }) {
  return (
    <Masonry
      breakpointCols={{ default: 4, 1024: 3, 640: 2, 480: 1 }}
      className="-ml-4 flex"
      columnClassName="pl-4"
    >
      {images.map((img) => (
        <div
          key={img.href}
          role="button"
          tabIndex={0}
          className="mb-4 cursor-pointer"
          onClick={() => onSelect(img)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(img)}
        >
          <Card
            title={img.title}
            imgSrc={img.imgSrc}
            width={img.width}
            height={img.height}
            imageOptimize={img.imageOptimize}
          />
        </div>
      ))}
    </Masonry>
  )
}
