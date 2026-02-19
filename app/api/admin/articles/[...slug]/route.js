import { auth } from '../../../../../auth'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { getArticle, updateArticle, deleteArticle } from '@/lib/articles'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'

/**
 * GET /api/admin/articles/[...slug]
 *
 * Retrieve a single article by slug (e.g., 2024/01/15/my-article)
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const resolvedParams = await params
    const slug = resolvedParams.slug.join('/')
    const article = await getArticle(slug)

    if (!article) {
      return NextResponse.json({ error: 'Articulo no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ article })
  } catch (error) {
    // Check if it's a "not found" error from the S3 layer
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: 'Articulo no encontrado' }, { status: 404 })
    }
    console.error('Error fetching article:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * PUT /api/admin/articles/[...slug]
 *
 * Update an existing article
 */
export const PUT = auth(async function PUT(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Check permission to edit articles
  const permissionError = checkPermission(req, Actions.EDIT_ARTICLE)
  if (permissionError) {
    return permissionError
  }

  try {
    const resolvedParams = await params
    const slug = resolvedParams.slug.join('/')
    const updates = await req.json()

    const article = await updateArticle(slug, updates)

    // Revalidate aggregate pages and the specific article page
    revalidatePath('/blog')
    revalidatePath('/tags')
    revalidatePath(`/blog/${slug}`)

    return NextResponse.json({ article })
  } catch (error) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: 'Articulo no encontrado' }, { status: 404 })
    }
    console.error('Error updating article:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * DELETE /api/admin/articles/[...slug]
 *
 * Delete an article by slug
 */
export const DELETE = auth(async function DELETE(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Check permission to delete articles
  const permissionError = checkPermission(req, Actions.DELETE_ARTICLE)
  if (permissionError) {
    return permissionError
  }

  try {
    const resolvedParams = await params
    const slug = resolvedParams.slug.join('/')

    await deleteArticle(slug)

    // Revalidate aggregate pages
    revalidatePath('/blog')
    revalidatePath('/tags')

    return NextResponse.json({ deleted: true, slug })
  } catch (error) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: 'Articulo no encontrado' }, { status: 404 })
    }
    console.error('Error deleting article:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
