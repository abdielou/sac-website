import { NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getMediaEntry } from '@/lib/media-s3'

function getS3Client() {
  return new S3Client({
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: true,
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
      const result = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: entry.s3Key, Range: range })
      )

      return new NextResponse(result.Body.transformToWebStream(), {
        status: 206,
        headers: {
          'Content-Type': result.ContentType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Range': result.ContentRange,
          'Content-Length': String(result.ContentLength),
        },
      })
    }

    // Full file
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: entry.s3Key }))

    return new NextResponse(result.Body.transformToWebStream(), {
      status: 200,
      headers: {
        'Content-Type': result.ContentType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(result.ContentLength),
      },
    })
  } catch (error) {
    console.error('S3 stream error:', error)
    return NextResponse.json({ error: 'Error al obtener video' }, { status: 500 })
  }
}
