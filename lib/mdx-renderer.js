import { serialize } from 'next-mdx-remote/serialize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCodeTitles from './remark-code-title'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypePrismPlus from 'rehype-prism-plus'
import GithubSlugger from 'github-slugger'

/**
 * Compile MDX content from S3 article into serialized result for next-mdx-remote
 * @param {string} source - Raw MDX content string
 * @returns {Promise<{ mdxSource: object }>} Serialized MDX result
 */
export async function compileMDX(source) {
  const mdxSource = await serialize(source, {
    mdxOptions: {
      remarkPlugins: [remarkGfm, remarkCodeTitles, remarkMath],
      rehypePlugins: [
        rehypeSlug,
        rehypeAutolinkHeadings,
        rehypeKatex,
        [rehypePrismPlus, { ignoreMissing: true }],
      ],
    },
  })

  return { mdxSource }
}

/**
 * Extract table of contents from MDX content
 * @param {string} source - Raw MDX content string
 * @returns {Array<{ value: string, url: string, depth: number }>} TOC entries
 */
export function extractToc(source) {
  const slugger = new GithubSlugger()
  const toc = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm

  let match
  while ((match = headingRegex.exec(source)) !== null) {
    const depth = match[1].length
    const value = match[2].trim()
    const url = '#' + slugger.slug(value)
    toc.push({ value, url, depth })
  }

  return toc
}
