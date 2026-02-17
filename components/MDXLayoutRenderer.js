'use client'

import { useMemo } from 'react'
import { getMDXComponent } from 'mdx-bundler/client'
import { MDXComponents } from './MDXComponents'
import AboutCardLayout from '@/layouts/AboutCardLayout'

const layouts = {
  AboutCardLayout,
}

const Wrapper = ({ components, layout, ...rest }) => {
  const Layout = layouts[layout]
  if (Layout) {
    return <Layout {...rest} />
  }
  return <>{rest.children}</>
}

export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={{ ...MDXComponents, wrapper: Wrapper }} {...rest} />
}
