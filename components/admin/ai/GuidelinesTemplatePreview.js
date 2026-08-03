'use client'

import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { listBackgroundOptions } from '@/lib/social-template/backgroundCatalog'
import { buildTemplateSvg } from '@/lib/social-template/buildTemplateSvg'
import { getSocialCanvas } from '@/lib/social-template/platformCanvas'
import { getTemplateLayout } from '@/lib/social-template/templateLayouts'

const EXAMPLE_TEXT = {
  event: {
    headline: 'Noche de Observación',
    subtitle: 'Acompáñanos a descubrir el cielo',
    body: 'Una noche para observar, aprender y compartir bajo las estrellas.',
    dateLabel: '15 AGO',
    timeLabel: '8 PM',
    locationLabel: 'ARECIBO',
    weatherDisclaimer: 'Sujeto a las condiciones del tiempo.',
  },
  simple: {
    headline: 'Descubre el cielo de Puerto Rico',
  },
}

function logoPreview(layout, canvas) {
  const tokens = layout.logo
  const shortLogo = tokens.asset === 'short'
  const aspectRatio = shortLogo ? 1320 / 320 : 1320 / 450
  const maxWidth = canvas.width * tokens.maxWidthPct
  const maxHeight = canvas.height * tokens.maxHeightPct
  const width = Math.min(maxWidth, maxHeight * aspectRatio)
  const height = width / aspectRatio
  const left = canvas.width * tokens.xPct
  const top = canvas.height - canvas.height * tokens.yFromBottomPct - height

  return {
    src: shortLogo
      ? '/static/images/sac-white-short-logo-25.svg'
      : '/static/images/sac-white-logo-25.svg',
    placement: { left, top, width, height },
    style: {
      left: `${(left / canvas.width) * 100}%`,
      top: `${(top / canvas.height) * 100}%`,
      width: `${(width / canvas.width) * 100}%`,
      height: `${(height / canvas.height) * 100}%`,
    },
  }
}

export default function GuidelinesTemplatePreview({ layoutId = 'event' }) {
  const backgrounds = useMemo(() => listBackgroundOptions(), [])
  const [backgroundId, setBackgroundId] = useState(backgrounds[0]?.id || '')
  const selectedBackground =
    backgrounds.find(({ id }) => id === backgroundId) || backgrounds[0] || null
  const preview = useMemo(() => {
    const canvas = getSocialCanvas()
    const layout = getTemplateLayout(layoutId, canvas) || getTemplateLayout('event', canvas)
    const logo = logoPreview(layout, canvas)
    const svg = buildTemplateSvg({
      layout,
      canvas,
      textFields: EXAMPLE_TEXT[layout.id] || EXAMPLE_TEXT.simple,
      logoPlacement: logo.placement,
    }).replace(/^<\?xml[^>]*>\s*/, '')
    return { layout, logo, svg }
  }, [layoutId])

  if (!selectedBackground) return null

  return (
    <figure
      data-template-preview={preview.layout.id}
      className="mx-auto w-full max-w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#0B081C]">
        <Image
          src={selectedBackground.thumbnailUrl}
          alt=""
          fill
          sizes="280px"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: preview.svg }}
        />
        <span className="absolute" style={preview.logo.style}>
          <Image src={preview.logo.src} alt="" fill sizes="60px" className="object-contain" />
        </span>
      </div>
      <figcaption className="mt-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Así se verá el cartel</p>
        <label
          htmlFor={`template-preview-background-${preview.layout.id}`}
          className="mt-2 block text-xs font-medium text-gray-600 dark:text-gray-300"
        >
          Fondo de ejemplo
        </label>
        <select
          id={`template-preview-background-${preview.layout.id}`}
          value={selectedBackground.id}
          onChange={(event) => setBackgroundId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 outline-none focus:border-[#560647] focus:ring-2 focus:ring-[#C8ABDB] dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          {backgrounds.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </figcaption>
    </figure>
  )
}
