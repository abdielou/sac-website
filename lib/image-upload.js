import { PutObjectCommand } from '@aws-sdk/client-s3'
import { createS3Client, isS3Stubbed, saveStubPublicFile } from './s3-client.js'

/**
 * Public image upload to the images S3 bucket, shared by the article and guide
 * upload routes. In S3 stub mode the file goes to `public/local-s3/` instead.
 */

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

let imageS3Client = null
function getImageS3Client() {
  if (!imageS3Client) {
    imageS3Client = createS3Client()
  }
  return imageS3Client
}

/**
 * Sanitize filename for S3 key:
 * - lowercase
 * - replace spaces with hyphens
 * - remove non-alphanumeric except hyphens and dots
 */
export function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-.]/g, '')
    .replace(/-+/g, '-')
}

/**
 * Validate and upload one image file.
 *
 * The key is `<keyPrefix>/YYYY/MM/DD/<filename>`. With `uniqueName`, the file
 * name gets a millisecond timestamp prefix so two files with the same name do
 * not overwrite each other.
 *
 * @param {File} file - The `file` field of the request FormData
 * @param {Object} options
 * @param {string} options.keyPrefix - For example `images/blog`
 * @param {boolean} [options.uniqueName=false]
 * @returns {Promise<{ok: true, url: string, key: string} | {ok: false, status: number, error: string}>}
 */
export async function uploadPublicImage(file, { keyPrefix, uniqueName = false }) {
  if (!file || typeof file === 'string') {
    return { ok: false, status: 400, error: 'No se proporciono un archivo' }
  }
  if (!file.type?.startsWith('image/')) {
    return { ok: false, status: 400, error: 'El archivo debe ser una imagen' }
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { ok: false, status: 400, error: 'El archivo excede el tamano maximo (10MB)' }
  }

  // Generate S3 key with date-based path
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const filename = sanitizeFilename(file.name)
  const name = uniqueName ? `${now.getTime()}-${filename}` : filename
  const key = `${keyPrefix}/${year}/${month}/${day}/${name}`

  const buffer = Buffer.from(await file.arrayBuffer())

  if (isS3Stubbed()) {
    const url = await saveStubPublicFile(key, buffer)
    return { ok: true, url, key }
  }

  const bucketName = process.env.S3_IMAGES_BUCKET_NAME
  if (!bucketName) {
    return { ok: false, status: 500, error: 'S3_IMAGES_BUCKET_NAME no esta configurado' }
  }

  await getImageS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  )

  return { ok: true, url: `https://${bucketName}.s3.amazonaws.com/${key}`, key }
}
