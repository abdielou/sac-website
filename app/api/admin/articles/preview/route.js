import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { serialize } from 'next-mdx-remote/serialize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCodeTitles from '@/lib/remark-code-title'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypePrismPlus from 'rehype-prism-plus'

/**
 * POST /api/admin/articles/preview
 *
 * Compile MDX content for live preview in the article editor.
 * Returns serialized MDX that the client-side MDXRemote can render.
 *
 * Body: { content: string }
 * Returns: { mdxSource } on success, { error: string } on compilation error
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()
    const content = body.content || ''

    if (!content.trim()) {
      return NextResponse.json({ mdxSource: null })
    }

    try {
      const mdxSource = await serialize(content, {
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

      return NextResponse.json({ mdxSource })
    } catch (compileError) {
      // Compilation errors are expected during editing — return as data, not 500
      return NextResponse.json({
        error: compileError.message || 'Error de compilacion MDX',
      })
    }
  } catch (error) {
    console.error('Error in preview endpoint:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
