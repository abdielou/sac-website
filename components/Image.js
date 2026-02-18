'use client'

import NextImage from 'next/image'

const Image = ({ width, height, fill, ...rest }) => {
  if (!fill && (!width || !height)) {
    // MDX content often uses <Image> without dimensions — fall back to native img
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  }
  return <NextImage width={width} height={height} fill={fill} {...rest} />
}

export default Image
