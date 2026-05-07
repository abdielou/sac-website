import AWS from 'aws-sdk'

let s3Client = null

export function getMediaS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

const getBucket = () => process.env.S3_IMAGES_BUCKET_NAME

export async function getMediaIndex() {
  const bucket = getBucket()
  if (!bucket) {
    return { media: [], updatedAt: null }
  }

  try {
    const s3 = getMediaS3Client()
    const result = await s3.getObject({ Bucket: bucket, Key: 'media/index.json' }).promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return { media: [], updatedAt: null }
    }
    console.error('S3 media index error:', error)
    throw error
  }
}

export async function putMediaIndex(indexData) {
  const s3 = getMediaS3Client()
  return s3
    .putObject({
      Bucket: getBucket(),
      Key: 'media/index.json',
      Body: JSON.stringify(indexData, null, 2),
      ContentType: 'application/json',
    })
    .promise()
}

export async function getMediaEntry(slug) {
  const index = await getMediaIndex()
  return index.media.find((m) => m.slug === slug) || null
}

export async function putMediaEntry(entry) {
  const index = await getMediaIndex()
  const existingIdx = index.media.findIndex((m) => m.slug === entry.slug)
  if (existingIdx >= 0) {
    index.media[existingIdx] = entry
  } else {
    index.media.push(entry)
  }
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)
}

function thumbnailKeyFromBucketUrl(thumbnail, bucket) {
  if (!thumbnail || !bucket) {
    return null
  }

  try {
    const url = new URL(thumbnail)
    const key =
      url.hostname === `${bucket}.s3.amazonaws.com`
        ? url.pathname.replace(/^\/+/, '')
        : null

    if (!key || !key.startsWith('media/posters/')) {
      return null
    }

    return decodeURIComponent(key)
  } catch {
    return null
  }
}

export function getMediaAssetKeys(entry) {
  const keys = [entry?.s3Key, thumbnailKeyFromBucketUrl(entry?.thumbnail, getBucket())].filter(
    Boolean
  )

  return [...new Set(keys)]
}

export async function deleteMediaAssetObjects(entry) {
  const bucket = getBucket()
  if (!bucket) {
    throw new Error('S3_IMAGES_BUCKET_NAME no esta configurado')
  }

  const keys = getMediaAssetKeys(entry)
  if (keys.length === 0) {
    return
  }

  const s3 = getMediaS3Client()
  await s3
    .deleteObjects({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: true,
      },
    })
    .promise()
}

export async function deleteReplacedMediaThumbnail(previousEntry, nextEntry) {
  const bucket = getBucket()
  if (!bucket) {
    throw new Error('S3_IMAGES_BUCKET_NAME no esta configurado')
  }

  if (previousEntry?.thumbnail === nextEntry?.thumbnail) {
    return
  }

  const previousThumbnailKey = thumbnailKeyFromBucketUrl(previousEntry?.thumbnail, bucket)
  if (!previousThumbnailKey) {
    return
  }

  const s3 = getMediaS3Client()
  await s3
    .deleteObjects({
      Bucket: bucket,
      Delete: {
        Objects: [{ Key: previousThumbnailKey }],
        Quiet: true,
      },
    })
    .promise()
}

export async function deleteMediaEntry(slug) {
  const index = await getMediaIndex()
  index.media = index.media.filter((m) => m.slug !== slug)
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)
}

export function renameMediaS3Key(oldKey, newSlug) {
  if (!oldKey || !newSlug) {
    return null
  }

  const lastSlash = oldKey.lastIndexOf('/')
  const dir = lastSlash >= 0 ? oldKey.slice(0, lastSlash + 1) : ''
  const oldFilename = lastSlash >= 0 ? oldKey.slice(lastSlash + 1) : oldKey
  const dotIdx = oldFilename.lastIndexOf('.')
  const ext = dotIdx > 0 ? oldFilename.slice(dotIdx) : ''

  return `${dir}${newSlug}${ext}`
}

export async function renameMediaEntry(oldSlug, newSlug) {
  const bucket = getBucket()
  if (!bucket) {
    throw new Error('S3_IMAGES_BUCKET_NAME no esta configurado')
  }

  const trimmedOld = String(oldSlug || '').trim()
  const trimmedNew = String(newSlug || '').trim()
  if (!trimmedOld || !trimmedNew) {
    throw new Error('slug requerido')
  }

  const index = await getMediaIndex()
  const existing = index.media.find((m) => m.slug === trimmedOld)
  if (!existing) {
    throw new Error('Video no encontrado')
  }

  if (trimmedOld === trimmedNew) {
    return existing
  }

  const collides = index.media.some((m) => m.slug === trimmedNew)
  if (collides) {
    throw new Error('Ya existe un video con ese nombre')
  }

  if (!existing.s3Key) {
    throw new Error('La entrada no tiene un archivo asociado')
  }

  const newS3Key = renameMediaS3Key(existing.s3Key, trimmedNew)
  if (!newS3Key) {
    throw new Error('No se pudo calcular la nueva ruta del archivo')
  }

  const s3 = getMediaS3Client()
  await s3
    .copyObject({
      Bucket: bucket,
      CopySource: `${bucket}/${existing.s3Key}`,
      Key: newS3Key,
    })
    .promise()

  const updated = { ...existing, slug: trimmedNew, s3Key: newS3Key }
  index.media = index.media.map((m) => (m.slug === trimmedOld ? updated : m))
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)

  await s3
    .deleteObject({
      Bucket: bucket,
      Key: existing.s3Key,
    })
    .promise()

  return updated
}
