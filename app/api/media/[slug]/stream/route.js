import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'
import { getMediaEntry } from '@/lib/media-s3'

function getS3Client() {
  return new AWS.S3({
    endpoint: process.env.AWS_S3_ENDPOINT,
    s3ForcePathStyle: true,
    region: process.env.AWS_REGION,
  })
}

function getBucket() {
  return process.env.S3_IMAGES_BUCKET_NAME
}

export async function GET(request, { params }) {
  const { slug } = await params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  const s3 = getS3Client()
  const bucket = getBucket()
  const range = request.headers.get('range')

  try {
    if (range) {
      // Forward the Range header to S3 and trust its response headers.
      // This correctly handles partial content, open ranges (bytes=0-), and
      // returns the proper Content-Range / Content-Length for the slice.
      const result = await s3
        .getObject({ Bucket: bucket, Key: entry.s3Key, Range: range })
        .promise()

      return new NextResponse(result.Body, {
        status: 206,
        headers: {
          'Content-Type': result.ContentType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Range': result.ContentRange,
          'Content-Length': result.ContentLength,
        },
      })
    }

    // Full file
    const result = await s3.getObject({ Bucket: bucket, Key: entry.s3Key }).promise()

    return new NextResponse(result.Body, {
      status: 200,
      headers: {
        'Content-Type': result.ContentType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': result.ContentLength,
      },
    })
  } catch (error) {
    console.error('S3 stream error:', error)
    return NextResponse.json({ error: 'Error al obtener video' }, { status: 500 })
  }
}
