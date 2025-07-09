import { useState, useEffect, useMemo } from 'react'
import { PageSEO } from '@/components/SEO'
import GalleryFilters from '@/components/GalleryFilters'
import GalleryGrid from '@/components/GalleryGrid'
import AWS from 'aws-sdk'
import { getAvailableYears, getMonthNames } from '@/lib/utils/galleryUtils'

export default function Gallery({ images, error }) {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageWidth, setImageWidth] = useState(null)
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => getAvailableYears(images, currentYear), [images, currentYear])
  const monthNames = useMemo(() => getMonthNames('es'), [])

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
  }, [selectedImage])

  return (
    <>
      {selectedImage && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90 border-none p-0 focus:outline-none"
          onClick={() => setSelectedImage(null)}
          onClickCapture={(e) => {
            if (e.target instanceof Element && e.target.closest('[data-modal-content]')) {
              e.stopPropagation()
            }
          }}
        >
          <div
            data-modal-content
            role="dialog"
            aria-modal="true"
            className="flex flex-col items-center"
          >
            <button
              className="absolute top-4 right-4 text-white text-3xl p-2"
              onClick={() => setSelectedImage(null)}
            >
              &times;
            </button>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage.imgSrc}
              alt={selectedImage.title}
              className="max-w-full max-h-full"
              onLoad={(e) => setImageWidth(e.currentTarget.clientWidth)}
            />
            <div
              className="mt-4 text-center text-white"
              style={imageWidth ? { maxWidth: imageWidth } : {}}
            >
              <h2 className="text-2xl font-bold">{selectedImage.title}</h2>
              {selectedImage.description && <p className="mt-2">{selectedImage.description}</p>}
              {selectedImage.year && (
                <p className="mt-1 text-sm text-gray-300">
                  {selectedImage.month
                    ? `${monthNames[selectedImage.month]} ${selectedImage.year}`
                    : selectedImage.year}
                </p>
              )}
            </div>
          </div>
        </button>
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
            <p className="text-red-500 text-center">Error loading images: {error}</p>
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

export async function getStaticProps() {
  try {
    const s3 = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
    const bucketName = process.env.S3_BUCKET_NAME
    const metadataKey = process.env.S3_METADATA_KEY
    const imagesPrefix = process.env.S3_IMAGES_PREFIX
    if (!bucketName) {
      throw new Error('Missing S3_BUCKET_NAME env var; please add it to .env')
    }

    const metadataRes = await s3.getObject({ Bucket: bucketName, Key: metadataKey }).promise()
    const metadataArr = JSON.parse(metadataRes.Body.toString('utf-8'))
    const metaMap = {}
    metadataArr.forEach((item) => {
      if (item.photo_url) metaMap[item.photo_url] = item
    })

    const monthMap = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
      dic: 12,
    }

    const { Contents = [] } = await s3
      .listObjectsV2({ Bucket: bucketName, Prefix: imagesPrefix })
      .promise()
    const images = Contents.map((obj) => {
      const url = `${s3.endpoint.href}${bucketName}/${encodeURIComponent(obj.Key)}`
      const fileName = obj.Key.split('/').pop()
      const meta = metaMap[fileName] || {}
      const yearVal = meta.year ? parseInt(meta.year, 10) : null
      const monthVal = meta.month ? monthMap[meta.month.toLowerCase()] || null : null
      return {
        title: meta.title || '',
        description: meta.description || '',
        imgSrc: url,
        href: url,
        width: meta.width || 1088,
        height: meta.height || 612,
        year: yearVal,
        month: monthVal,
        imageOptimize: false,
      }
    })

    return { props: { images } }
  } catch (error) {
    console.error('Gallery SSG error:', error)
    return { props: { images: [], error: error.message } }
  }
}
