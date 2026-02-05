'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { formatDate, formatCurrency } from '@/lib/formatters'

const SOURCE_LABELS = {
  ath_movil: 'ATH Movil',
  paypal: 'PayPal',
  manual: 'Manual',
}

function formatSource(source) {
  return SOURCE_LABELS[source] || source || '-'
}

const TOOLTIP_WIDTH = 224 // w-56 = 14rem = 224px
const TOOLTIP_HEIGHT_ESTIMATE = 120 // approximate max height
const GAP = 8 // space between button and tooltip

/**
 * Calculate tooltip position avoiding viewport edges
 * Flips vertically if too close to top, clamps horizontally
 */
function calcPosition(btnRect) {
  const centerX = btnRect.left + btnRect.width / 2
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Vertical: prefer above, flip below if not enough space
  const spaceAbove = btnRect.top
  const showBelow = spaceAbove < TOOLTIP_HEIGHT_ESTIMATE + GAP

  let top
  if (showBelow) {
    top = btnRect.bottom + GAP
  } else {
    top = btnRect.top - GAP
  }

  // Horizontal: align right edge of tooltip to button center, so it extends left
  // Then clamp to stay within viewport
  let left = centerX
  let translateX = '-80%'
  // If too close to the left edge, shift right
  if (centerX - TOOLTIP_WIDTH * 0.8 < 8) {
    translateX = '-20%'
  }

  return { top, left, showBelow, translateX }
}

/**
 * Eye icon with tooltip showing last payment details
 * Uses fixed positioning via portal to escape overflow containers
 * Detects viewport edges and repositions to stay visible
 */
export function PaymentTooltip({ date, amount, notes, source }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  const updatePos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos(calcPosition(rect))
  }, [])

  // Recalculate position on open and scroll/resize
  useEffect(() => {
    if (!open) return
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open, updatePos])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleMouseEnter = () => {
    updatePos()
    setOpen(true)
  }
  const handleMouseLeave = () => setOpen(false)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          updatePos()
          setOpen((v) => !v)
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded transition-colors"
        aria-label="Ver detalles del pago"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: pos.showBelow
                ? `translateX(${pos.translateX})`
                : `translate(${pos.translateX}, -100%)`,
              zIndex: 9999,
            }}
            className="w-56 p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <TooltipContent date={date} amount={amount} notes={notes} source={source} />
            {/* Arrow pointing toward the button */}
            {pos.showBelow ? (
              <div
                className="absolute bottom-full border-4 border-transparent border-b-gray-900 dark:border-b-gray-700"
                style={{
                  left: pos.translateX === '-20%' ? '20%' : '80%',
                  transform: 'translateX(-50%)',
                }}
              />
            ) : (
              <div
                className="absolute top-full border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
                style={{
                  left: pos.translateX === '-20%' ? '20%' : '80%',
                  transform: 'translateX(-50%)',
                }}
              />
            )}
          </div>,
          document.body
        )}
    </>
  )
}

function TooltipContent({ date, amount, notes, source }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-gray-400">Fecha:</span>
        <span>{formatDate(date)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Monto:</span>
        <span>{formatCurrency(amount)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Fuente:</span>
        <span>{formatSource(source)}</span>
      </div>
      {notes && (
        <div className="pt-1 border-t border-gray-700 dark:border-gray-600">
          <span className="text-gray-400">Mensaje:</span>
          <p className="mt-0.5 text-gray-200 break-words">{notes}</p>
        </div>
      )}
    </div>
  )
}

export default PaymentTooltip
