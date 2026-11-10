import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'
import { uploadPublicImage } from '../../../../../lib/image-upload'

/**
 * POST /api/admin/guides/upload-image
 *
 * Upload an image for a manual guide object. Accepts FormData with a 'file'
 * field. Returns the public URL and S3 key.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json(
      { error: 'No autenticado', details: 'Authentication required' },
      { status: 401 }
    )
  }

  // Image upload is part of creating or editing a guide
  const createPermissionError = checkPermission(req, Actions.CREATE_GUIDE)
  const editPermissionError = checkPermission(req, Actions.EDIT_GUIDE)
  if (createPermissionError && editPermissionError) {
    return NextResponse.json(
      {
        error: 'Permiso denegado',
        details: 'You need permission to create or edit guides to upload images',
      },
      { status: 403 }
    )
  }

  try {
    const formData = await req.formData()
    const result = await uploadPublicImage(formData.get('file'), {
      keyPrefix: 'images/guides',
      uniqueName: true,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ url: result.url, key: result.key })
  } catch (error) {
    console.error('Error uploading guide image:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
