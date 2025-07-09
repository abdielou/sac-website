import AWS from 'aws-sdk'

// Configure S3 to point at localstack (fallback to localhost:4566)
const s3 = new AWS.S3({
  endpoint: process.env.AWS_S3_ENDPOINT,
  s3ForcePathStyle: true,
  region: process.env.AWS_REGION,
})

export default async function handler(req, res) {
  try {
    // Fetch metadata JSON from S3 bucket
    const metadataRes = await s3
      .getObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: process.env.S3_METADATA_KEY,
      })
      .promise()
    const metadataArr = JSON.parse(metadataRes.Body.toString('utf-8'))
    const metaMap = {}
    metadataArr.forEach((item) => {
      if (item.photo_url) metaMap[item.photo_url] = item
    })

    // Map Spanish month names to numeric values for filtering
    const monthMap = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
      dic: 12,
    }

    // List only image files under images/
    const { Contents = [] } = await s3
      .listObjectsV2({
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: process.env.S3_IMAGES_PREFIX,
      })
      .promise()
    const images = Contents.map((obj) => {
      const lastModified = new Date(obj.LastModified)
      const url = `${s3.endpoint.href}${process.env.S3_BUCKET_NAME}/${encodeURIComponent(obj.Key)}`
      // Extract filename and lookup metadata
      const fileName = obj.Key.split('/').pop()
      const meta = metaMap[fileName] || {}
      // Determine year and month from metadata; leave null if missing
      const yearVal = meta.year ? parseInt(meta.year, 10) : null
      const monthVal = meta.month ? monthMap[meta.month.toLowerCase()] || null : null
      return {
        title: meta.title || '',
        description: meta.title ? meta.description || '' : '',
        imgSrc: url,
        href: url,
        width: 1088,
        height: 612,
        year: yearVal,
        month: monthVal,
        imageOptimize: false,
      }
    })
    res.status(200).json(images)
  } catch (error) {
    console.error('S3 list error:', error)
    res.status(500).json({ error: 'Failed to load images' })
  }
}
