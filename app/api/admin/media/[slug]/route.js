import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { getMediaEntry, putMediaEntry, deleteMediaEntry } from '../../../../../lib/media-s3'
import { checkPermission, checkReadAccess } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'
import { revalidatePath } from 'next/cache'

/**
 * GET /api/admin/media/[slug]
 */
export const GET = auth(async function GET(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const readError = checkReadAccess(req, 'media')
  if (readError) return readError

  const { slug } = await params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ entry })
})

/**
 * PUT /api/admin/media/[slug]
 *
 * Body: { title, description, thumbnail, duration, publishedAt }
 */
export const PUT = auth(async function PUT(req, { params }) {
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

  const { slug } = await params
  const existing = await getMediaEntry(slug)

  if (!existing) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const updated = {
      ...existing,
      title: body.title?.trim() || existing.title,
      description: body.description?.trim() || existing.description,
      thumbnail: body.thumbnail?.trim() || existing.thumbnail,
      duration: body.duration !== undefined ? body.duration : existing.duration,
      publishedAt: body.publishedAt || existing.publishedAt,
    }

    await putMediaEntry(updated)

    revalidatePath('/media')
    revalidatePath('/')

    return NextResponse.json({ entry: updated })
  } catch (error) {
    console.error('Error updating media entry:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})

/**
 * DELETE /api/admin/media/[slug]
 */
export const DELETE = auth(async function DELETE(req, { params }) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  const permissionError = checkPermission(req, Actions.DELETE_MEDIA)
  if (permissionError) {
    return permissionError
  }

  const { slug } = await params
  const existing = await getMediaEntry(slug)

  if (!existing) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  try {
    await deleteMediaEntry(slug)

    revalidatePath('/media')
    revalidatePath('/')

    return NextResponse.json({ deleted: slug })
  } catch (error) {
    console.error('Error deleting media entry:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
