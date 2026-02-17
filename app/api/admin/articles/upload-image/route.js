import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'

// Lazy-initialized S3 client for image uploads
let imageS3Client = null
function getImageS3Client() {
  if (!imageS3Client) {
    imageS3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return imageS3Client
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Sanitize filename for S3 key:
 * - lowercase
 * - replace spaces with hyphens
 * - remove non-alphanumeric except hyphens and dots
 */
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-.]/g, '')
    .replace(/-+/g, '-')
}

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

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    // Validate file exists
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No se proporciono un archivo' }, { status: 400 })
    }

    // Validate MIME type
    if (!file.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el tamano maximo (10MB)' },
        { status: 400 }
      )
    }

    // Generate S3 key with date-based path
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const filename = sanitizeFilename(file.name)
    const key = `images/blog/${year}/${month}/${day}/${filename}`

    // Upload to S3
    const bucketName = process.env.S3_IMAGES_BUCKET_NAME
    if (!bucketName) {
      return NextResponse.json(
        { error: 'S3_IMAGES_BUCKET_NAME no esta configurado' },
        { status: 500 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const s3 = getImageS3Client()

    await s3
      .putObject({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
      .promise()

    // Construct public URL
    const region = process.env.AWS_REGION || 'us-east-1'
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`

    return NextResponse.json({ url, key })
  } catch (error) {
    console.error('Error uploading image:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
