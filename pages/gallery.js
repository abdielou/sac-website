/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { useState, useEffect, useMemo } from 'react'
import { PageSEO } from '@/components/SEO'
import GalleryFilters from '@/components/GalleryFilters'
import GalleryGrid from '@/components/GalleryGrid'
import { getAvailableYears, getMonthNames } from '@/lib/utils/galleryUtils'

export default function Gallery() {
  const [images, setImages] = useState([])
  const [error, setError] = useState(null)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageWidth, setImageWidth] = useState(null)
  const [imageHeight, setImageHeight] = useState(null)
  const [zoom, setZoom] = useState(1)
  const ZOOM_SCALE = 0.8
  const years = useMemo(() => getAvailableYears(images), [images])
  const monthNames = useMemo(() => getMonthNames('es'), [])

  useEffect(() => {
    async function fetchGallery() {
      try {
        const res = await fetch('/api/photos')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        setImages(
          data.map((item) => {
            // Extract UNIX timestamp from the S3 key (assumes a sequence of digits in the key)
            const match = item.key.match(/(\d{10,})/)
            let year = null
            let month = null
            if (match) {
              const timestampMs = parseInt(match[1], 10) * 1000
              const d = new Date(timestampMs)
              year = d.getFullYear()
              month = d.getMonth() + 1
            }
            return {
              title: item.title,
              description: item.description,
              imgSrc: item.url,
              href: item.url,
              width: item.width,
              height: item.height,
              year,
              month,
              trueDate: item.trueDate,
              imageOptimize: false,
            }
          })
        )
      } catch (err) {
        setError(err.message)
      }
    }
    fetchGallery()
  }, [])

  // Filtering logic
  const filteredImages = images.filter((img) => {
    const matchesYear = year === 'all' || year === '' || (img.year && img.year.toString() === year)
    const matchesMonth =
      month === 'all' || month === '' || (img.month && img.month.toString() === month)
    const matchesSearch =
      !searchTerm ||
      (img.title && img.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (img.description && img.description.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesYear && matchesMonth && matchesSearch
  })

  useEffect(() => {
    setImageWidth(null)
    setImageHeight(null)
    setZoom(1)
  }, [selectedImage])

  // Add image navigation functions
  const goPrev = () => {
    const idx = images.findIndex((img) => img.imgSrc === selectedImage.imgSrc)
    if (idx > 0) {
      setSelectedImage(images[idx - 1])
    }
  }

  const goNext = () => {
    const idx = images.findIndex((img) => img.imgSrc === selectedImage.imgSrc)
    if (idx < images.length - 1) {
      setSelectedImage(images[idx + 1])
    }
  }

  return (
    <>
      {selectedImage && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90 overflow-auto px-4"
          onClick={() => setSelectedImage(null)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedImage(null)}
        >
          <div
            data-modal-content
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="flex flex-col items-center max-w-[calc(100vw-6rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative inline-block mx-auto overflow-visible">
              {zoom === 1 && (
                <button
                  type="button"
                  className="absolute top-2 right-2 z-50 text-white text-3xl w-10 h-10 flex items-center justify-center bg-black bg-opacity-50 hover:bg-opacity-75 rounded-lg shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedImage(null)
                  }}
                >
                  &times;
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
              <img
                src={selectedImage.imgSrc}
                alt={selectedImage.title}
                className="max-w-[calc(100vw-6rem)] max-h-[calc(100vh-12rem)] object-contain transform transition-transform duration-200 ease-out"
                style={{
                  transform: `scale(${zoom})`,
                  cursor: zoom === 1 ? 'zoom-in' : 'zoom-out',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (zoom === 1 && imageWidth && imageHeight) {
                    const scaleX = (window.innerWidth * ZOOM_SCALE) / imageWidth
                    const scaleY = (window.innerHeight * ZOOM_SCALE) / imageHeight
                    const fullScale = Math.min(scaleX, scaleY)
                    setZoom(fullScale)
                  } else {
                    setZoom(1)
                  }
                }}
                onLoad={(e) => {
                  setImageWidth(e.currentTarget.clientWidth)
                  setImageHeight(e.currentTarget.clientHeight)
                }}
              />
              {zoom === 1 && (
                <>
                  <button
                    type="button"
                    className="absolute -left-12 top-1/2 transform -translate-y-1/2 text-white text-3xl p-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      goPrev()
                    }}
                  >
                    &larr;
                  </button>
                  <button
                    type="button"
                    className="absolute -right-12 top-1/2 transform -translate-y-1/2 text-white text-3xl p-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      goNext()
                    }}
                  >
                    &rarr;
                  </button>
                </>
              )}
            </div>
            {zoom === 1 && (
              <div
                className="mt-4 text-center text-white"
                style={imageWidth ? { maxWidth: imageWidth } : {}}
              >
                <h2 className="text-2xl font-bold">{selectedImage.title}</h2>
                {selectedImage.description && <p className="mt-2">{selectedImage.description}</p>}
                {selectedImage.year && (
                  <p className="mt-1 text-sm text-gray-300">
                    {selectedImage.trueDate === false && 'Aproximadamente: '}
                    {selectedImage.month
                      ? `${monthNames[selectedImage.month]} ${selectedImage.year}`
                      : selectedImage.year}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <PageSEO title="Galería" description="Galería de imágenes" />
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="pt-6 pb-8 space-y-2 md:space-y-5 text-center">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Galería
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Explora y descubre hermosas imágenes</p>
        </div>
        <div className="container py-8 sm:py-8 md:py-8S">
          {error ? (
            <p className="text-red-500 text-center">Error loading gallery: {error}</p>
          ) : images.length === 0 ? (
            <p className="text-center">No images found.</p>
          ) : (
            <>
              <GalleryFilters
                year={year}
                setYear={setYear}
                month={month}
                setMonth={setMonth}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                years={years}
                monthNames={monthNames}
              />
              <GalleryGrid images={filteredImages} onSelect={setSelectedImage} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
