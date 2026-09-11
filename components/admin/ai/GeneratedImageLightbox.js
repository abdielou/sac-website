'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Full-viewport review surface for the exact generated bitmap.
 */
export default function GeneratedImageLightbox({ image, onClose, returnFocusRef }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!image) return undefined

    const previousOverflow = document.body.style.overflow
    const returnFocusElement = returnFocusRef?.current
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []
      )
      if (!focusableElements.length) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocusElement?.focus()
    }
  }, [image, onClose, returnFocusRef])

  if (!image || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generated-image-preview-title"
        aria-describedby="generated-image-preview-help"
        className="flex h-full min-h-0 w-full flex-col"
      >
        <div
          className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-4 pb-3 text-white"
          onClick={(event) => event.stopPropagation()}
        >
          <div>
            <h2 id="generated-image-preview-title" className="text-base font-semibold sm:text-lg">
              Vista ampliada
            </h2>
            <p id="generated-image-preview-help" className="text-xs text-white/65 sm:text-sm">
              Esta es la misma imagen que se descargará.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Cerrar
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          {/* Data URLs cannot use the Next image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.dataUrl}
            alt="Arte compartido para redes sociales, vista ampliada"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
