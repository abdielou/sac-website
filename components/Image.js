'use client'

import NextImage from 'next/image'

/**
 * Width of the widest content column the site renders an image into.
 * SectionContainer is `max-w-3xl` (768px) and `xl:max-w-5xl`, so 768px is the
 * width that matters for the phones and tablets that download the most bytes.
 */
const COLUMN_WIDTH = 768

/** Default `sizes` hint for an image that fills the content column. */
export const COLUMN_SIZES = `(max-width: ${COLUMN_WIDTH}px) 100vw, ${COLUMN_WIDTH}px`

/**
 * Pick a `sizes` hint when the caller gives none.
 *
 * Without `sizes`, next/image emits a DPR srcset built from the intrinsic width,
 * so a 1920px source became `w=1920 1x, w=3840 2x` and a DPR-1 phone downloaded
 * the 3840px variant into a ~768px column. Capping those to the column width is
 * a large saving.
 *
 * Images that are already narrower than the column (avatars, icons, badges) keep
 * the DPR srcset, which is correct for them: a blanket `100vw` hint would make
 * the browser pick a far larger candidate than it needs.
 */
export function resolveSizes({ sizes, width, fill } = {}) {
  if (sizes) return sizes
  if (fill) return COLUMN_SIZES
  const intrinsic = Number(width)
  if (!Number.isFinite(intrinsic) || intrinsic <= COLUMN_WIDTH) return undefined
  return COLUMN_SIZES
}

const Image = ({ width, height, fill, sizes, priority = false, loading, ...rest }) => {
  if (!fill && (!width || !height)) {
    // MDX content often uses <Image> without dimensions — fall back to native img
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img loading={loading || 'lazy'} decoding="async" {...rest} />
  }
  // next/image warns when `priority` and `loading` are both set, so only one wins.
  const loadingProps = priority || !loading ? {} : { loading }
  return (
    <NextImage
      width={width}
      height={height}
      fill={fill}
      sizes={resolveSizes({ sizes, width, fill })}
      priority={priority}
      {...loadingProps}
      {...rest}
    />
  )
}

export default Image
