import AWS from 'aws-sdk'

const s3 = new AWS.S3({
  endpoint: process.env.AWS_S3_ENDPOINT,
  s3ForcePathStyle: true,
  region: process.env.AWS_REGION,
})

export default async function handler(req, res) {
  try {
    // Determine target prefix (year)
    const year = req.query?.year
    let prefix = ''
    if (year) {
      prefix = `${year}/`
    } else {
      // Find the latest year folder
      const topLevel = await s3
        .listObjectsV2({ Bucket: process.env.S3_BUCKET_NAME, Delimiter: '/' })
        .promise()
      const prefixes = (topLevel.CommonPrefixes || []).map((p) => p.Prefix.replace(/\/$/, ''))
      const years = prefixes.map((p) => parseInt(p, 10)).filter((y) => !isNaN(y))
      const latestYear = years.sort((a, b) => b - a)[0]
      prefix = latestYear ? `${latestYear}/` : ''
    }

    // List all objects under the target prefix
    const { Contents = [] } = await s3
      .listObjectsV2({ Bucket: process.env.S3_BUCKET_NAME, Prefix: prefix })
      .promise()

    // Filter out any directory placeholders
    const keys = Contents.map((o) => o.Key).filter((key) => key && !key.endsWith('/'))

    // 3) Build gallery array by fetching per-object metadata, signed URL, and trueDate flag
    const gallery = await Promise.all(
      keys.map(async (key) => {
        const head = await s3.headObject({ Bucket: process.env.S3_BUCKET_NAME, Key: key }).promise()
        const title = head.Metadata.title || ''
        const description = head.Metadata.description || ''
        // S3 metadata keys are lowercased
        const trueDateRaw = head.Metadata.truedate
        // Interpret 'false' explicitly as false; default to true
        const trueDate = trueDateRaw != null ? trueDateRaw.toLowerCase() === 'true' : true
        const url = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
          Expires: 3600,
        })
        return { key, title, description, url, trueDate }
      })
    )

    return res.status(200).json(gallery)
  } catch (error) {
    console.error('S3 list error:', error)
    return res.status(500).json({ error: 'Failed to load gallery' })
  }
}
