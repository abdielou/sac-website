import { auth } from '../../../../auth'
import { NextResponse } from 'next/server'
import { getMediaIndex, putMediaEntry } from '../../../../lib/media-s3'
import { checkPermission, checkReadAccess } from '../../../../lib/api-permissions'
import { Actions } from '../../../../lib/permissions'
import { revalidatePath } from 'next/cache'

/**
 * Generate a URL-friendly slug from a title.
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/**
 * Ensure slug uniqueness by appending a counter if needed.
 */
async function uniqueSlug(baseSlug, existingSlugs) {
  let slug = baseSlug
  let counter = 1
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`
    counter++
  }
  return slug
}

/**
 * GET /api/admin/media
 *
 * Query params:
 * - search: title text search (optional)
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

  const readError = checkReadAccess(req, 'media')
  if (readError) return readError

  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.toLowerCase()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))

    const index = await getMediaIndex()
    let items = index.media || []

    // Apply search filter
    if (search) {
      items = items.filter(
        (m) =>
          m.title?.toLowerCase().includes(search) ||
          m.slug?.toLowerCase().includes(search) ||
          m.description?.toLowerCase().includes(search)
      )
    }

    // Sort by publishedAt descending (newest first)
    items.sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt) : new Date(0)
      const dateB = b.publishedAt ? new Date(b.publishedAt) : new Date(0)
      return dateB - dateA
    })

    // Paginate
    const total = items.length
    const totalPages = Math.ceil(total / pageSize)
    const start = (page - 1) * pageSize
    const paginated = items.slice(start, start + pageSize)

    return NextResponse.json({
      media: paginated,
      total,
      page,
      pageSize,
      totalPages,
    })
  } catch (error) {
    console.error('Error listing media:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * POST /api/admin/media
 *
 * Body: { title (required), description, s3Key, thumbnail, duration }
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.EDIT_MEDIA)
  if (permissionError) {
    return permissionError
  }

  try {
    const body = await req.json()

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'El titulo es requerido' }, { status: 400 })
    }

    if (!body.s3Key || !body.s3Key.trim()) {
      return NextResponse.json({ error: 'El archivo de video es requerido' }, { status: 400 })
    }

    // Generate slug
    const baseSlug = slugify(body.title.trim())
    const index = await getMediaIndex()
    const existingSlugs = index.media.map((m) => m.slug)
    const slug = await uniqueSlug(baseSlug, existingSlugs)

    // Build entry
    const entry = {
      slug,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      s3Key: body.s3Key.trim(),
      thumbnail: body.thumbnail?.trim() || null,
      duration: body.duration || null,
      publishedAt: body.publishedAt || new Date().toISOString(),
    }

    await putMediaEntry(entry)

    // Revalidate media pages
    revalidatePath('/media')
    revalidatePath('/')

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error('Error creating media entry:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
