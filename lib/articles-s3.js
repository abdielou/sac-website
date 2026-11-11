import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

let s3Client = null

export function getArticleS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.AWS_S3_ENDPOINT,
      forcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

const getBucket = () => process.env.S3_ARTICLES_BUCKET_NAME

export async function putArticleJSON(key, articleData) {
  try {
    const s3 = getArticleS3Client()
    const result = await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: JSON.stringify(articleData, null, 2),
        ContentType: 'application/json',
      })
    )
    return result
  } catch (error) {
    console.error('S3 article error:', error)
    throw new Error(`Failed to write article: ${key}`)
  }
}

export async function getArticleJSON(key) {
  const bucket = getBucket()

  // Throw error if bucket not configured
  if (!bucket) {
    throw new Error(`Article not found: ${key} (S3 not configured)`)
  }

  try {
    const s3 = getArticleS3Client()
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
    return JSON.parse(await result.Body.transformToString())
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      throw new Error(`Article not found: ${key}`)
    }
    console.error('S3 article error:', error)
    throw new Error(`Failed to read article: ${key}`)
  }
}

export async function deleteArticleJSON(key) {
  try {
    const s3 = getArticleS3Client()
    const result = await s3.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    )
    return result
  } catch (error) {
    console.error('S3 article error:', error)
    throw new Error(`Failed to delete article: ${key}`)
  }
}

export async function getArticleIndex() {
  const bucket = getBucket()

  // Return empty index if bucket not configured (during development/build without S3)
  if (!bucket) {
    return { articles: [], updatedAt: null }
  }

  try {
    const s3 = getArticleS3Client()
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: 'articles/index.json',
      })
    )
    return JSON.parse(await result.Body.transformToString())
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return { articles: [], updatedAt: null }
    }
    console.error('S3 article error:', error)
    throw new Error('Failed to read article index')
  }
}

export async function putArticleIndex(indexData) {
  try {
    const s3 = getArticleS3Client()
    const result = await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: 'articles/index.json',
        Body: JSON.stringify(indexData, null, 2),
        ContentType: 'application/json',
      })
    )
    return result
  } catch (error) {
    console.error('S3 article error:', error)
    throw new Error('Failed to write article index')
  }
}
