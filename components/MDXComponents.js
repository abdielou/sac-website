import { useMemo } from 'react'
import ReactPlayer from 'react-player'
import { getMDXComponent } from 'mdx-bundler/client'
import Image from './Image'
import ImageCaption from './ImageCaption'
import CustomLink from './Link'
import TOCInline from './TOCInline'
import Pre from './Pre'
import { BlogNewsletterForm } from './NewsletterForm'
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
  BlogNewsletterForm: BlogNewsletterForm,
  wrapper: ({ components, layout, ...rest }) => {
    const Layout = require(`../layouts/${layout}`).default
    return <Layout {...rest} />
  },
  ResponsiveReactPlayer,
  TwitterEmbed,
}

export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={MDXComponents} {...rest} />
}
