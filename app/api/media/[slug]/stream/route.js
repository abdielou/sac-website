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
  const { slug } = params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  const s3 = getS3Client()
  const bucket = getBucket()
  const range = request.headers.get('range')

  try {
    if (range) {
      // Parse byte range: bytes=start-end
      const match = range.match(/^bytes=(\d+)-(\d*)$/)
      if (!match) {
        return new NextResponse(null, { status: 416 })
      }
      const start = parseInt(match[1], 10)
      const end = match[2] ? parseInt(match[2], 10) : undefined

      const result = await s3
        .getObject({ Bucket: bucket, Key: entry.s3Key, Range: range })
        .promise()

      const contentLength = end !== undefined ? end - start + 1 : result.ContentLength - start
      const contentRange = `bytes ${start}-${end !== undefined ? end : result.ContentLength - 1}/${result.ContentLength}`

      return new NextResponse(result.Body, {
        status: 206,
        headers: {
          'Content-Type': result.ContentType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Range': contentRange,
          'Content-Length': contentLength,
        },
      })
    }

    // Full file
    const result = await s3
      .getObject({ Bucket: bucket, Key: entry.s3Key })
      .promise()

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