import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'
import { uploadPublicImage } from '../../../../../lib/image-upload'

/**
 * POST /api/admin/articles/upload-image
 *
 * Upload an image file to S3. Accepts FormData with a 'file' field.
 * Returns the public URL and S3 key.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Check permission to create/edit articles (image upload is part of article creation/editing)
  const createPermissionError = checkPermission(req, Actions.CREATE_ARTICLE)
  const editPermissionError = checkPermission(req, Actions.EDIT_ARTICLE)

  // User needs either create or edit permission to upload images
  if (createPermissionError && editPermissionError) {
    return NextResponse.json(
      {
        error: 'Permiso denegado',
        details: 'You need permission to create or edit articles to upload images',
      },
      { status: 403 }
    )
  }

  try {
    const formData = await req.formData()
    const result = await uploadPublicImage(formData.get('file'), { keyPrefix: 'images/blog' })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ url: result.url, key: result.key })
  } catch (error) {
    console.error('Error uploading image:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
