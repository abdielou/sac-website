import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getGuide, updateGuide, deleteGuide } from '@/lib/guides'
import { checkPermission, checkReadAccess } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'

/**
 * GET /api/admin/guides/[slug]
 *
 * Retrieve a single guide by slug
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const readError = checkReadAccess(req, 'guides')
  if (readError) return readError

  try {
    const resolvedParams = await params
    const slug = resolvedParams.slug
    const guide = await getGuide(slug)

    if (!guide) {
      return NextResponse.json(
        { error: 'Guia no encontrada', details: `Guide not found: ${slug}` },
        { status: 404 }
      )
    }

    return NextResponse.json({ guide })
  } catch (error) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Guia no encontrada', details: error.message },
        { status: 404 }
      )
    }
    console.error('Error fetching guide:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * PUT /api/admin/guides/[slug]
 *
 * Update an existing guide
 */
export const PUT = auth(async function PUT(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Check permission to edit guides
  const permissionError = checkPermission(req, Actions.EDIT_GUIDE)
  if (permissionError) {
    return permissionError
  }

  try {
    const body = await req.json()

    // If publishing, also check publish permission
    if (body.status === 'published') {
      const publishError = checkPermission(req, Actions.PUBLISH_GUIDE)
      if (publishError) {
        return publishError
      }
    }

    const resolvedParams = await params
    const slug = resolvedParams.slug
    const guide = await updateGuide(slug, body)

    return NextResponse.json({ guide })
  } catch (error) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Guia no encontrada', details: error.message },
        { status: 404 }
      )
    }
    console.error('Error updating guide:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * DELETE /api/admin/guides/[slug]
 *
 * Delete a guide by slug
 */
export const DELETE = auth(async function DELETE(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Check permission to delete guides
  const permissionError = checkPermission(req, Actions.DELETE_GUIDE)
  if (permissionError) {
    return permissionError
  }

  try {
    const resolvedParams = await params
    const slug = resolvedParams.slug

    await deleteGuide(slug)

    return NextResponse.json({ deleted: true, slug })
  } catch (error) {
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Guia no encontrada', details: error.message },
        { status: 404 }
      )
    }
    console.error('Error deleting guide:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
