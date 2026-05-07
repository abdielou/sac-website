/**
 * Upload a JPEG/PNG/WebP poster to the images bucket (same layout as manual admin upload).
 */

import { getMediaS3Client } from './media-s3'

/**
 * @param {Buffer} buffer
 * @param {string} [contentType]
 * @returns {Promise<{ url: string, key: string }>}
 */
export async function uploadPosterJpegBytes(buffer, contentType = 'image/jpeg') {
  const bucketName = process.env.S3_IMAGES_BUCKET_NAME
  if (!bucketName) {
    throw new Error('S3_IMAGES_BUCKET_NAME no esta configurado')
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  let ext = 'jpg'
  if (contentType.includes('png')) ext = 'png'
  else if (contentType.includes('webp')) ext = 'webp'
  const key = `media/posters/${year}/${month}/${day}/${stamp}.${ext}`

  let ct = 'image/jpeg'
  if (contentType.includes('png')) ct = 'image/png'
  else if (contentType.includes('webp')) ct = 'image/webp'

  const s3 = getMediaS3Client()

  await s3.putObject({ Bucket: bucketName, Key: key, Body: buffer, ContentType: ct }).promise()

  const url = `https://${bucketName}.s3.amazonaws.com/${key}`
  return { url, key }
}
