/**
 * Upload a JPEG/PNG/WebP poster to the images bucket (same layout as manual admin upload).
 */

import { getMediaS3Client } from './media-s3'
import sharp from 'sharp'

const POSTER_MAX_WIDTH = 640
const POSTER_MAX_HEIGHT = 360
const POSTER_QUALITY = 82

export async function normalizePosterImage(buffer) {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: POSTER_MAX_WIDTH,
      height: POSTER_MAX_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: POSTER_QUALITY, mozjpeg: true })
    .toBuffer()
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ url: string, key: string }>}
 */
export async function uploadPosterJpegBytes(buffer) {
  const bucketName = process.env.S3_IMAGES_BUCKET_NAME
  if (!bucketName) {
    throw new Error('S3_IMAGES_BUCKET_NAME no esta configurado')
  }

  const posterBuffer = await normalizePosterImage(buffer)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const key = `media/posters/${year}/${month}/${day}/${stamp}.jpg`

  const s3 = getMediaS3Client()

  await s3
    .putObject({ Bucket: bucketName, Key: key, Body: posterBuffer, ContentType: 'image/jpeg' })
    .promise()

  const url = `https://${bucketName}.s3.amazonaws.com/${key}`
  return { url, key }
}
