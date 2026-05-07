import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'
import { uploadPosterJpegBytes } from '../../../../../lib/media-poster-s3'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // Original upload; server normalizes before S3.

/**
 * POST /api/admin/media/poster
 *
 * Upload a JPEG/PNG poster image for media cards (typically a frame grabbed from video).
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
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No se proporciono un archivo' }, { status: 400 })
    }

    // Some browsers omit Blob.type when appending JPEG from canvas; treat empty as jpeg.
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
    }

    const contentType =
      file.type && file.type.startsWith('image/') ? file.type.split(';')[0].trim() : 'image/jpeg'

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'La imagen excede 25MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { url, key } = await uploadPosterJpegBytes(buffer, contentType)
    return NextResponse.json({ url, key })
  } catch (error) {
    console.error('Error uploading media poster:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
