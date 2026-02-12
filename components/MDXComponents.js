'use client'

import { useMemo } from 'react'
import ReactPlayer from 'react-player'
import { getMDXComponent } from 'mdx-bundler/client'
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

// MDXLayoutRenderer for legacy Pages Router pages (about, authors, etc.)
// DO NOT USE for new App Router blog pages - use next-mdx-remote instead
export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={MDXComponents} {...rest} />
}

// Export as default for compatibility
export default MDXComponents
