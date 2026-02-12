'use client'

import ReactPlayer from 'react-player'
import Image from './Image'
import ImageCaption from './ImageCaption'
import CustomLink from './Link'
import TOCInline from './TOCInline'
import Pre from './Pre'
import TwitterEmbed from './TwitterEmbed'

const ResponsiveReactPlayer = ({ url }) => (
  <div className="relative p-[56.25%]">
    <ReactPlayer className="absolute top-0 left-0" url={url} width="100%" height="100%" />
  </div>
)

export const MDXComponents = {
  Image,
  ImageCaption,
  TOCInline,
  a: CustomLink,
  pre: Pre,
  ResponsiveReactPlayer,
  TwitterEmbed,
}

// Export as default for compatibility
export default MDXComponents
