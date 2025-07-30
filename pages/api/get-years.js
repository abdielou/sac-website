import AWS from 'aws-sdk'

const s3 = new AWS.S3({
  endpoint: process.env.AWS_S3_ENDPOINT,
  s3ForcePathStyle: true,
  region: process.env.AWS_REGION,
})

export default async function handler(req, res) {
  try {
    const result = await s3
      .listObjectsV2({ Bucket: process.env.S3_BUCKET_NAME, Delimiter: '/' })
      .promise()

    const years = (result.CommonPrefixes || []).map((p) => p.Prefix.replace(/\/$/, ''))

    return res.status(200).json(years)
  } catch (error) {
    console.error('Error listing years:', error)
    return res.status(500).json({ error: 'Failed to list years' })
  }
}
