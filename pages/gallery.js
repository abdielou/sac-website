/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import { useState, useEffect } from 'react'
import { PageSEO } from '@/components/SEO'
import GalleryFilters from '@/components/GalleryFilters'
import GalleryGrid from '@/components/GalleryGrid'
import Icon from '@/components/Icon'

export default function Gallery() {
  const [images, setImages] = useState([])
  const [error, setError] = useState(null)
  const [year, setYear] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageWidth, setImageWidth] = useState(null)
  const [imageHeight, setImageHeight] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [yearOptions, setYearOptions] = useState([])
  const [loadedYears, setLoadedYears] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const ZOOM_SCALE = 0.8

  // Fetch available years for the filter dropdown
  useEffect(() => {
    async function fetchYears() {
      try {
        const res = await fetch('/api/get-years')
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        // Sort years descending so newest appears first
        const sortedYears = data.slice().sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
        setYearOptions(sortedYears)
      } catch (err) {
        console.error('Failed to fetch year list:', err)
      }
    }
    fetchYears()
  }, [])

  useEffect(() => {
    async function fetchGallery() {
      try {
        const url = year ? `/api/photos?year=${year}` : '/api/photos'
        const res = await fetch(url)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const imgs = data.map((item) => {
          // Extract year and month from the S3 key prefix (YYYY/MM/DD)
          const parts = item.key.split('/')
          let year = null
          let month = null
          if (parts.length >= 3) {
            const y = parseInt(parts[0], 10)
            const m = parseInt(parts[1], 10)
            year = Number.isInteger(y) ? y : null
            month = Number.isInteger(m) ? m : null
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
        setImages(imgs)
        // Default the year filter to the loaded year on initial load
        if (!year && imgs.length > 0 && imgs[0].year) {
          setYear(imgs[0].year.toString())
        }
      } catch (err) {
        setError(err.message)
      }
    }
    fetchGallery()
  }, [year])

  useEffect(() => {
    if (year && loadedYears.length === 0) {
      setLoadedYears([year])
    }
  }, [year, loadedYears])

  // Filtering logic
  const filteredImages = images.filter((img) => {
    // If we have loaded multiple years, show all loaded years
    const matchesYear =
      year === 'all' ||
      year === '' ||
      (loadedYears.length > 1
        ? loadedYears.includes(img.year?.toString())
        : img.year && img.year.toString() === year)
    const matchesSearch =
      !searchTerm ||
      (img.title && img.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (img.description && img.description.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesYear && matchesSearch
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

  const loadMore = async () => {
    if (loadingMore || loadedYears.length >= yearOptions.length) return
    setLoadingMore(true)
    try {
      const nextIdx = loadedYears.length
      const nextYear = yearOptions[nextIdx]
      const res = await fetch(`/api/photos?year=${nextYear}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const newImgs = data.map((item) => {
        const parts = item.key.split('/')
        let y = null
        let m = null
        if (parts.length >= 3) {
          const py = parseInt(parts[0], 10)
          const pm = parseInt(parts[1], 10)
          y = Number.isInteger(py) ? py : null
          m = Number.isInteger(pm) ? pm : null
        }
        return {
          title: item.title,
          description: item.description,
          imgSrc: item.url,
          href: item.url,
          width: item.width,
          height: item.height,
          year: y,
          month: m,
          trueDate: item.trueDate,
          imageOptimize: false,
        }
      })
      setImages((prev) => [...prev, ...newImgs])
      setLoadedYears((prev) => [...prev, nextYear])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
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
            className="flex flex-col items-center max-w-[calc(100vw-6rem)] z-20 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Navigation buttons positioned just outside the image container */}
            {zoom === 1 && (
              <>
                <button
                  type="button"
                  className="absolute top-0 h-full flex items-center justify-center text-white bg-white bg-opacity-5 hover:bg-opacity-10 transition-all duration-200 z-10"
                  style={{
                    right: '100%',
                    width: '200px',
                    marginRight: '1rem',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    goPrev()
                  }}
                >
                  <Icon kind="arrowLeft" size={10} className="text-white" />
                </button>
                <button
                  type="button"
                  className="absolute top-0 h-full flex items-center justify-center text-white bg-white bg-opacity-5 hover:bg-opacity-10 transition-all duration-200 z-10"
                  style={{
                    left: '100%',
                    width: '200px',
                    marginLeft: '1rem',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    goNext()
                  }}
                >
                  <Icon kind="arrowRight" size={10} className="text-white" />
                </button>
              </>
            )}
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
                  backgroundColor: 'green',
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
            </div>
            {zoom === 1 && (
              <div
                className="mt-4 text-center text-white"
                style={
                  imageWidth
                    ? {
                        maxWidth: imageWidth,
                        width: imageWidth,
                        minWidth: 0,
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                      }
                    : {}
                }
              >
                <h2 className="text-2xl font-bold wrap-break-word">{selectedImage.title}</h2>
                {selectedImage.description && (
                  <p className="mt-2 wrap-break-word">{selectedImage.description}</p>
                )}
                {selectedImage.year && (
                  <p className="mt-1 text-sm text-gray-300 wrap-break-word">
                    {selectedImage.trueDate === false && 'Aproximadamente: '}
                    {selectedImage.year}
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
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                years={yearOptions}
              />
              <GalleryGrid images={filteredImages} onSelect={setSelectedImage} />
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore || loadedYears.length >= yearOptions.length}
                className="mt-6 px-4 py-2 border rounded mx-auto block disabled:opacity-50"
              >
                {loadingMore
                  ? 'Loading...'
                  : loadedYears.length >= yearOptions.length
                  ? 'No more images'
                  : 'Load more'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
