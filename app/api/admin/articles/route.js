import { auth } from '../../../../auth'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { listArticles, createArticle } from '@/lib/articles'

/**
 * GET /api/admin/articles
 *
 * Query params:
 * - status: "published" or "draft" (optional, default: all)
 * - search: title text search (optional)
 * - tag: filter by tag (optional)
 * - page: page number, 1-indexed (default: 1)
 * - pageSize: items per page (default: 50)
 */
export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')?.toLowerCase()
    const tag = searchParams.get('tag')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))

    // Fetch all articles (including drafts) with optional tag filter
    // We pass page=1 and a large pageSize to get all results for client-side filtering
    const result = await listArticles({
      includeDrafts: true,
      tag: tag || null,
      page: 1,
      pageSize: 10000,
    })

    let articles = result.articles

    // Apply status filter
    if (status === 'published') {
      articles = articles.filter((a) => a.draft !== true)
    } else if (status === 'draft') {
      articles = articles.filter((a) => a.draft === true)
    }

    // Apply search filter (case-insensitive title substring match)
    if (search) {
      articles = articles.filter((a) => a.title?.toLowerCase().includes(search))
    }

    // Sort by lastmod descending (most recently edited first)
    articles.sort((a, b) => {
      const dateA = a.lastmod ? new Date(a.lastmod) : new Date(a.date)
      const dateB = b.lastmod ? new Date(b.lastmod) : new Date(b.date)
      return dateB - dateA
    })

    // Paginate
    const total = articles.length
    const totalPages = Math.ceil(total / pageSize)
    const start = (page - 1) * pageSize
    const paginated = articles.slice(start, start + pageSize)

    return NextResponse.json({
      articles: paginated,
      total,
      page,
      pageSize,
      totalPages,
    })
  } catch (error) {
    console.error('Error listing articles:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * POST /api/admin/articles
 *
 * Body: { title (required), date, tags, summary, content, images, imgWidth, imgHeight, authors, draft }
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

    // Validate title
    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'El titulo es requerido' }, { status: 400 })
    }

    // Default date to now if not provided
    const data = {
      title: body.title.trim(),
      date: body.date || new Date().toISOString(),
      tags: body.tags || [],
      summary: body.summary || '',
      content: body.content || '',
      images: body.images || [],
      imgWidth: body.imgWidth || null,
      imgHeight: body.imgHeight || null,
      authors: body.authors || [],
      draft: body.draft !== undefined ? body.draft : true,
    }

    const article = await createArticle(data)

    // Revalidate aggregate pages
    revalidatePath('/blog')
    revalidatePath('/tags')

    return NextResponse.json({ article }, { status: 201 })
  } catch (error) {
    console.error('Error creating article:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
