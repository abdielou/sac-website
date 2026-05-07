import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import {
  getMediaEntry,
  putMediaEntry,
  deleteMediaEntry,
  deleteMediaAssetObjects,
  deleteReplacedMediaThumbnail,
  renameMediaEntry,
} from '../../../../../lib/media-s3'
import { slugifyMediaName } from '../../../../../lib/media-slug'
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
 * Body: { title, description, thumbnail, duration, publishedAt, slug }
 *
 * If `body.slug` is provided and (after sanitizing) differs from the path
 * slug, the S3 video object is moved to a new key in the same directory and
 * the public permalink changes. The old `/media/<slug>` URL stops working.
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

    let workingEntry = existing
    let didRename = false
    if (typeof body.slug === 'string' && body.slug.trim()) {
      const requestedSlug = slugifyMediaName(body.slug)
      if (!requestedSlug) {
        return NextResponse.json(
          { error: 'El nombre de archivo solicitado no es valido' },
          { status: 400 }
        )
      }
      if (requestedSlug !== existing.slug) {
        try {
          workingEntry = await renameMediaEntry(existing.slug, requestedSlug)
          didRename = true
        } catch (renameError) {
          const message = renameError?.message || 'No se pudo renombrar el archivo'
          const status = /ya existe/i.test(message) ? 409 : 500
          return NextResponse.json({ error: message }, { status })
        }
      }
    }

    const updated = {
      ...workingEntry,
      title: body.title?.trim() || workingEntry.title,
      description: body.description?.trim() || workingEntry.description,
      thumbnail: body.thumbnail?.trim() || workingEntry.thumbnail,
      duration: body.duration !== undefined ? body.duration : workingEntry.duration,
      publishedAt: body.publishedAt || workingEntry.publishedAt,
    }

    await putMediaEntry(updated)
    await deleteReplacedMediaThumbnail(existing, updated)

    revalidatePath('/media')
    revalidatePath('/')
    if (didRename) {
      revalidatePath(`/media/${existing.slug}`)
      revalidatePath(`/media/${updated.slug}`)
    }

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
    await deleteMediaAssetObjects(existing)
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
