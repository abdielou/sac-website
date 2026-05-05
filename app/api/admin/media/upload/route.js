import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'
import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'

let mediaS3Client = null
function getMediaS3Client() {
  if (!mediaS3Client) {
    mediaS3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return mediaS3Client
}

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB for video files

/**
 * Sanitize filename for S3 key
 */
function sanitizeKey(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-._]/g, '')
    .replace(/-+/g, '-')
}

/**
 * POST /api/admin/media/upload
 *
 * Upload a video file to S3. Accepts FormData with a 'file' field.
 * Returns the S3 key for use in the media entry creation.
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

    // Validate MIME type (video files)
    const validTypes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-msvideo',
    ]
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'El archivo debe ser un video (mp4, webm, ogg)' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el tamano maximo (500MB)' },
        { status: 400 }
      )
    }

    // Generate S3 key with date-based path
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const filename = sanitizeKey(file.name)
    const key = `media/videos/${year}/${month}/${day}/${filename}`

    // Upload to S3
    const bucketName = process.env.S3_IMAGES_BUCKET_NAME
    if (!bucketName) {
      return NextResponse.json(
        { error: 'S3_IMAGES_BUCKET_NAME no esta configurado' },
        { status: 500 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const s3 = getMediaS3Client()

    await s3
      .putObject({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
      .promise()

    return NextResponse.json({ s3Key: key, size: file.size, type: file.type })
  } catch (error) {
    console.error('Error uploading video:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
