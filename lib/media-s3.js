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
    const result = await s3
      .getObject({ Bucket: bucket, Key: 'media/index.json' })
      .promise()
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

export async function deleteMediaEntry(slug) {
  const index = await getMediaIndex()
  index.media = index.media.filter((m) => m.slug !== slug)
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)
}