import AWS from 'aws-sdk'

let s3Client = null

export function getArticleS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

const getBucket = () => process.env.S3_ARTICLES_BUCKET_NAME

export async function putArticleJSON(key, articleData) {
  try {
    const s3 = getArticleS3Client()
    const result = await s3
      .putObject({
        Bucket: getBucket(),
        Key: key,
        Body: JSON.stringify(articleData, null, 2),
        ContentType: 'application/json',
      })
      .promise()
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
    const result = await s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      throw new Error(`Article not found: ${key}`)
    }
    console.error('S3 article error:', error)
    throw new Error(`Failed to read article: ${key}`)
  }
}

export async function deleteArticleJSON(key) {
  try {
    const s3 = getArticleS3Client()
    const result = await s3
      .deleteObject({
        Bucket: getBucket(),
        Key: key,
      })
      .promise()
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
    const result = await s3
      .getObject({
        Bucket: bucket,
        Key: 'articles/index.json',
      })
      .promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return { articles: [], updatedAt: null }
    }
    console.error('S3 article error:', error)
    throw new Error('Failed to read article index')
  }
}

export async function putArticleIndex(indexData) {
  try {
    const s3 = getArticleS3Client()
    const result = await s3
      .putObject({
        Bucket: getBucket(),
        Key: 'articles/index.json',
        Body: JSON.stringify(indexData, null, 2),
        ContentType: 'application/json',
      })
      .promise()
    return result
  } catch (error) {
    console.error('S3 article error:', error)
    throw new Error('Failed to write article index')
  }
}
