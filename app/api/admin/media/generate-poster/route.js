import { auth } from '../../../../../auth'
import { NextResponse } from 'next/server'
import { mkdir, rm, readFile } from 'fs/promises'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import path from 'path'
import crypto from 'crypto'
import os from 'os'

import { checkPermission } from '../../../../../lib/api-permissions'
import { Actions } from '../../../../../lib/permissions'
import {
  getMediaEntry,
  putMediaEntry,
  getMediaS3Client,
  deleteReplacedMediaThumbnail,
} from '../../../../../lib/media-s3'
import { uploadPosterJpegBytes } from '../../../../../lib/media-poster-s3'
import { extractFrameToJpegFile, isFfmpegAvailable } from '../../../../../lib/video-poster-ffmpeg'
import { revalidatePath } from 'next/cache'

const MAX_DOWNLOAD_BYTES = 850 * 1024 * 1024

function getBucket() {
  return process.env.S3_IMAGES_BUCKET_NAME
}

/**
 * POST /api/admin/media/generate-poster
 * Body: { slug: string, force?: boolean }
 *
 * Downloads the video from S3, FFmpeg extracts ~0.5s frame, uploads poster JPEG, updates index.
 */
export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const permissionError = checkPermission(req, Actions.EDIT_MEDIA)
  if (permissionError) return permissionError

  const ffmpegOk = await isFfmpegAvailable()
  if (!ffmpegOk) {
    return NextResponse.json(
      {
        error: 'FFmpeg no disponible',
        details:
          'Configura FFmpeg en PATH o define FFMPEG_PATH para generar miniaturas en servidor',
      },
      { status: 503 }
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!slug) {
    return NextResponse.json({ error: 'slug requerido' }, { status: 400 })
  }

  const force = Boolean(body.force)

  const entry = await getMediaEntry(slug)
  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  if (entry.thumbnail && !force) {
    return NextResponse.json({ entry })
  }

  const bucket = getBucket()
  if (!bucket) {
    return NextResponse.json(
      { error: 'S3_IMAGES_BUCKET_NAME no esta configurado' },
      { status: 500 }
    )
  }

  let tmpDir = null

  try {
    const s3 = getMediaS3Client()
    const head = await s3.headObject({ Bucket: bucket, Key: entry.s3Key }).promise()

    const length = typeof head.ContentLength === 'number' ? head.ContentLength : 0
    if (length > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json(
        {
          error: 'El archivo de video es demasiado grande para procesar aqui',
          details: `${length}b`,
        },
        { status: 413 }
      )
    }

    tmpDir = path.join(os.tmpdir(), `sac-poster-${crypto.randomUUID()}`)
    await mkdir(tmpDir, { recursive: true })
    const srcPath = path.join(tmpDir, 'source-video.mp4')
    const jpgPath = path.join(tmpDir, 'poster.jpg')

    const readStream = s3.getObject({ Bucket: bucket, Key: entry.s3Key }).createReadStream()

    await pipeline(readStream, createWriteStream(srcPath))

    await extractFrameToJpegFile(srcPath, jpgPath, 0.5)

    const buf = await readFile(jpgPath)
    const { url } = await uploadPosterJpegBytes(buf, 'image/jpeg')

    const updated = { ...entry, thumbnail: url }
    await putMediaEntry(updated)
    await deleteReplacedMediaThumbnail(entry, updated)

    revalidatePath('/media')
    revalidatePath('/')

    return NextResponse.json({ entry: updated })
  } catch (err) {
    console.error('generate-poster error:', err)
    return NextResponse.json(
      {
        error: 'No se pudo generar miniatura',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  } finally {
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
})
