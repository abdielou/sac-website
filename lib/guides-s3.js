import AWS from 'aws-sdk'

let s3Client = null

function getGuideS3Client() {
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

export async function putGuideJSON(slug, guideData) {
  try {
    const s3 = getGuideS3Client()
    const result = await s3
      .putObject({
        Bucket: getBucket(),
        Key: `guides/${slug}.json`,
        Body: JSON.stringify(guideData, null, 2),
        ContentType: 'application/json',
      })
      .promise()
    return result
  } catch (error) {
    console.error('S3 guide error:', error)
    throw new Error(`Failed to write guide: ${slug}`)
  }
}

export async function getGuideJSON(slug) {
  const bucket = getBucket()

  if (!bucket) {
    throw new Error(`Guide not found: ${slug} (S3 not configured)`)
  }

  try {
    const s3 = getGuideS3Client()
    const result = await s3
      .getObject({
        Bucket: bucket,
        Key: `guides/${slug}.json`,
      })
      .promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      throw new Error(`Guide not found: ${slug}`)
    }
    console.error('S3 guide error:', error)
    throw new Error(`Failed to read guide: ${slug}`)
  }
}

export async function deleteGuideJSON(slug) {
  try {
    const s3 = getGuideS3Client()
    const result = await s3
      .deleteObject({
        Bucket: getBucket(),
        Key: `guides/${slug}.json`,
      })
      .promise()
    return result
  } catch (error) {
    console.error('S3 guide error:', error)
    throw new Error(`Failed to delete guide: ${slug}`)
  }
}

export async function getGuideIndex() {
  const bucket = getBucket()

  if (!bucket) {
    return { guides: [], updatedAt: null }
  }

  try {
    const s3 = getGuideS3Client()
    const result = await s3
      .getObject({
        Bucket: bucket,
        Key: 'guides/index.json',
      })
      .promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return { guides: [], updatedAt: null }
    }
    console.error('S3 guide error:', error)
    throw new Error('Failed to read guide index')
  }
}

export async function putGuideIndex(indexData) {
  try {
    const s3 = getGuideS3Client()
    const result = await s3
      .putObject({
        Bucket: getBucket(),
        Key: 'guides/index.json',
        Body: JSON.stringify(indexData, null, 2),
        ContentType: 'application/json',
      })
      .promise()
    return result
  } catch (error) {
    console.error('S3 guide error:', error)
    throw new Error('Failed to write guide index')
  }
}
