import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.AWS_S3_ENDPOINT,
  forcePathStyle: true,
  region: process.env.AWS_REGION,
})

export default async function handler(req, res) {
  try {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET_NAME, Delimiter: '/' })
    )

    const years = (result.CommonPrefixes || []).map((p) => p.Prefix.replace(/\/$/, ''))

    return res.status(200).json(years)
  } catch (error) {
    console.error('Error listing years:', error)
    return res.status(500).json({ error: 'Failed to list years' })
  }
}
