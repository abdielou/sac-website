import Image from './Image'
import ImageCaption from './ImageCaption'
import CustomLink from './Link'
import TOCInline from './TOCInline'
import Pre from './Pre'
import ResponsiveReactPlayer from './ResponsiveReactPlayer'
import TwitterEmbed from './TwitterEmbed'

export const MDXComponents = {
  Image,
  ImageCaption,
  TOCInline,
  a: CustomLink,
  pre: Pre,
  ResponsiveReactPlayer,
  TwitterEmbed,
}

export default MDXComponents
