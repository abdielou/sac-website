import React from 'react'
import Image from 'next/image'

export default function ImageModal({ image, monthNames, onClose }) {
  if (!image) return null

  // Clicking on the backdrop closes the modal
  return (
    <div
      // Accessibility: make backdrop interactive
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90"
      onClick={onClose}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClose()}
      onClickCapture={(e) => {
        // Prevent closing when clicking inside the dialog content
        if (e.target instanceof Element && e.target.closest('[data-modal-content]')) {
          e.stopPropagation()
        }
      }}
    >
      {/* Dialog content container */}
      <div
        data-modal-content
        role="dialog"
        aria-modal="true"
        className="flex flex-col items-center"
      >
        {/* Close button at top-right */}
        <button
          className="absolute top-4 right-4 text-white text-3xl p-2"
          onClick={onClose}
          aria-label="Close image modal"
        >
          &times;
        </button>

        {/* Display the image */}
        <Image
          src={image.imgSrc}
          alt={image.title}
          width={image.width}
          height={image.height}
          className="max-w-full max-h-full"
        />
        <div className="mt-4 text-center text-white max-w-full">
          <h2 className="text-2xl font-bold">{image.title}</h2>
          {image.description && <p className="mt-2">{image.description}</p>}
          {image.year && (
            <p className="mt-1 text-sm text-gray-300">
              {image.month ? `${monthNames[image.month]} ${image.year}` : image.year}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
