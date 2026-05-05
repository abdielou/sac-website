# Media Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted video management system — admin UI to upload/manage videos stored in S3, public permalink pages with embedded player, and article embedding via ComponentInsertMenu.

**Architecture:** Videos stored in existing S3 bucket under `media/videos/` with metadata index in `media/index.json`. Streaming through Next.js API routes that proxy S3 with Range header support. Client-side thumbnail extraction before upload. New `media` feature in permissions using existing `write_articles` gate.

**Tech Stack:** Next.js App Router, AWS SDK v2, native HTML5 video, Canvas API for thumbnails.

---

## File Map

```
NEW FILES:
  app/media/[slug]/page.js                      # Public video player page
  app/api/media/[slug]/meta/route.js           # Metadata endpoint
  app/api/media/[slug]/stream/route.js         # Streaming proxy
  app/api/admin/media/route.js                 # List/delete (admin)
  app/api/admin/media/upload/route.js          # Upload (admin)
  app/api/admin/media/[slug]/route.js          # Update metadata (admin)
  app/admin/media/page.js                      # Admin media manager page
  components/MediaPlayer.js                    # Client video player component
  lib/media-s3.js                              # S3 operations for media
  components/admin/MediaUploadZone.js          # Drag-drop upload component
  components/admin/MediaCard.js                # Grid card for admin
  components/admin/MediaEditModal.js           # Edit modal

MODIFIED FILES:
  lib/permissions.js                           # Add 'media' to FEATURES, AVOIDABLE_FEATURES
  components/admin/AdminSidebar.js             # Add media nav item
  components/ResponsiveReactPlayer.js         # Route /media/ URLs to MediaPlayer
  components/admin/ComponentInsertMenu.js      # Add Media option
  app/admin/articles/new/page.js              # Remove VideoUploadButton (discarded)
  app/admin/articles/edit/[...slug]/page.js   # Remove VideoUploadButton (discarded)
  app/api/admin/articles/upload-video/route.js # DELETE (discarded)
  components/admin/VideoUploadButton.js       # DELETE (discarded)

PRESERVE (already correct):
  docs/superpowers/specs/2026-05-05-media-manager-design.md
```

---

## Task 1: Add `media` to permissions system

**Files:**
- Modify: `lib/permissions.js:17` and `lib/permissions.js:297`

- [ ] **Step 1: Add 'media' to FEATURES**

Find line 17:
```js
export const FEATURES = ['members', 'payments', 'articles', 'guides']
```
Replace with:
```js
export const FEATURES = ['members', 'payments', 'articles', 'guides', 'media']
```

- [ ] **Step 2: Add 'media' to AVAILABLE_FEATURES**

Find line 297:
```js
export const AVAILABLE_FEATURES = ['dashboard', 'members', 'payments', 'articles', 'guides']
```
Replace with:
```js
export const AVAILABLE_FEATURES = ['dashboard', 'members', 'payments', 'articles', 'guides', 'media']
```

- [ ] **Step 3: Commit**

```bash
git add lib/permissions.js
git commit -m "feat(permissions): add media feature

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Create S3 utilities for media

**Files:**
- Create: `lib/media-s3.js`
- Test: `test/media-s3.test.js` (create alongside)

- [ ] **Step 1: Write the failing test**

```js
import { getMediaIndex, putMediaIndex, getMediaEntry, putMediaEntry, deleteMediaEntry } from '@/lib/media-s3'

describe('media-s3', () => {
  describe('getMediaIndex', () => {
    it('returns empty index when bucket not configured', async () => {
      const result = await getMediaIndex()
      expect(result).toEqual({ media: [], updatedAt: null })
    })
  })
})
```

Run: `npx jest test/media-s3.test.js -v`
Expected: FAIL — file does not exist

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL with "Cannot find module '@/lib/media-s3'"

- [ ] **Step 3: Write minimal implementation**

```js
import AWS from 'aws-sdk'

let s3Client = null

export function getMediaS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      endpoint: process.env.AWS_S3_ENDPOINT,
      s3ForcePathStyle: true,
      region: process.env.AWS_REGION,
    })
  }
  return s3Client
}

const getBucket = () => process.env.S3_IMAGES_BUCKET_NAME

export async function getMediaIndex() {
  const bucket = getBucket()
  if (!bucket) {
    return { media: [], updatedAt: null }
  }

  try {
    const s3 = getMediaS3Client()
    const result = await s3
      .getObject({ Bucket: bucket, Key: 'media/index.json' })
      .promise()
    return JSON.parse(result.Body.toString())
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return { media: [], updatedAt: null }
    }
    console.error('S3 media index error:', error)
    throw error
  }
}

export async function putMediaIndex(indexData) {
  const s3 = getMediaS3Client()
  return s3
    .putObject({
      Bucket: getBucket(),
      Key: 'media/index.json',
      Body: JSON.stringify(indexData, null, 2),
      ContentType: 'application/json',
    })
    .promise()
}

export async function getMediaEntry(slug) {
  const index = await getMediaIndex()
  return index.media.find((m) => m.slug === slug) || null
}

export async function putMediaEntry(entry) {
  const index = await getMediaIndex()
  const existingIdx = index.media.findIndex((m) => m.slug === entry.slug)
  if (existingIdx >= 0) {
    index.media[existingIdx] = entry
  } else {
    index.media.push(entry)
  }
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)
}

export async function deleteMediaEntry(slug) {
  const index = await getMediaIndex()
  index.media = index.media.filter((m) => m.slug !== slug)
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/media-s3.test.js -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/media-s3.js test/media-s3.test.js
git commit -m "feat(media): add S3 utilities for media index

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Create API routes for media metadata and streaming

**Files:**
- Create: `app/api/media/[slug]/meta/route.js`
- Create: `app/api/media/[slug]/stream/route.js`
- Test: `test/media-api.test.js`

- [ ] **Step 1: Write tests for meta and stream endpoints**

```js
// test/media-api.test.js
describe('GET /api/media/[slug]/meta', () => {
  it('returns 404 for non-existent slug', async () => {
    const res = await fetch('/api/media/nonexistent/meta')
    expect(res.status).toBe(404)
  })
})
```

Run: `npx jest test/media-api.test.js -v`
Expected: FAIL — routes don't exist

- [ ] **Step 2: Write meta endpoint**

```js
import { NextResponse } from 'next/server'
import { getMediaEntry } from '@/lib/media-s3'

export async function GET(request, { params }) {
  const { slug } = params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    slug: entry.slug,
    title: entry.title,
    description: entry.description || null,
    thumbnail: entry.thumbnail || null,
    publishedAt: entry.publishedAt,
  })
}
```

- [ ] **Step 3: Write stream endpoint**

```js
import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'
import { getMediaEntry } from '@/lib/media-s3'

function getBucket() {
  return process.env.S3_IMAGES_BUCKET_NAME
}

function getS3Client() {
  return new AWS.S3({
    endpoint: process.env.AWS_S3_ENDPOINT,
    s3ForcePathStyle: true,
    region: process.env.AWS_REGION,
  })
}

export async function GET(request, { params }) {
  const { slug } = params
  const entry = await getMediaEntry(slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  const s3 = getS3Client()
  const bucket = getBucket()

  // Handle range requests for seeking
  const range = request.headers.get('range')

  try {
    if (range) {
      // Parse byte range
      const match = range.match(/bytes=(\d+)-(\d*)/)
      if (!match) {
        return new NextResponse(null, { status: 416 })
      }
      const start = parseInt(match[1], 10)
      const end = match[2] ? parseInt(match[2], 10) : undefined

      const s3Params = { Bucket: bucket, Key: entry.s3Key, Range: range }
      const result = await s3.getObject(s3Params).promise()

      const contentRange = `bytes ${start}-${end || result.ContentLength - 1}/${result.ContentLength}`

      return new NextResponse(result.Body, {
        status: 206,
        headers: {
          'Content-Type': result.ContentType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Range': contentRange,
          'Content-Length': end ? end - start + 1 : result.ContentLength - start,
        },
      })
    }

    // Full file response
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
```

- [ ] **Step 4: Run tests**

Run: `npx jest test/media-api.test.js -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/media/
git commit -m "feat(media): add meta and stream API routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Create admin media API routes

**Files:**
- Create: `app/api/admin/media/route.js` (GET list + DELETE)
- Create: `app/api/admin/media/upload/route.js` (POST)
- Create: `app/api/admin/media/[slug]/route.js` (PUT update)
- Test: `test/media-admin.test.js`

- [ ] **Step 1: Write tests**

```js
import { POST } from '@/app/api/admin/media/upload/route'

describe('POST /api/admin/media/upload', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await POST({ auth: null, formData: () => {} })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Write upload route**

```js
import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'
import { checkPermission } from '../../../../../../lib/api-permissions'
import { Actions } from '../../../../../../lib/permissions'
import { getMediaIndex, putMediaIndex } from '@/lib/media-s3'

function getS3Client() {
  return new AWS.S3({
    endpoint: process.env.AWS_S3_ENDPOINT,
    s3ForcePathStyle: true,
    region: process.env.AWS_REGION,
  })
}

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

const ALLOWED_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska', 'video/mpeg',
]

function sanitizeSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-.]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function generateThumbnailBlob(videoBlob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = URL.createObjectURL(videoBlob)
    video.currentTime = 1
    video.load()
    video.onloadeddata = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, 640, 360)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(video.src)
          if (blob) resolve(blob)
          else resolve(null)
        },
        'image/jpeg',
        0.85
      )
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve(null)
    }
  })
}

export const POST = auth(async function POST(req) {
  if (!req.auth) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const createErr = checkPermission(req, Actions.CREATE_ARTICLE)
  const editErr = checkPermission(req, Actions.EDIT_ARTICLE)
  if (createErr && editErr) {
    return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const title = formData.get('title') || file.name.replace(/\.[^.]+$/, '')
    const description = formData.get('description') || ''
    const thumbnailOverride = formData.get('thumbnail')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No se proporciono un archivo' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el tamano maximo de 500MB' },
        { status: 400 }
      )
    }

    const bucketName = process.env.S3_IMAGES_BUCKET_NAME
    if (!bucketName) {
      return NextResponse.json({ error: 'S3 no configurado' }, { status: 500 })
    }

    // Generate unique slug
    let baseSlug = sanitizeSlug(file.name.replace(/\.[^.]+$/, ''))
    let slug = baseSlug
    const index = await getMediaIndex()
    let counter = 2
    while (index.media.some((m) => m.slug === slug)) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const ext = file.name.split('.').pop().toLowerCase()
    const s3Key = `media/videos/${year}/${month}/${day}/${slug}.${ext}`

    // Upload video to S3
    const s3 = getS3Client()
    const buffer = Buffer.from(await file.arrayBuffer())
    await s3
      .putObject({
        Bucket: bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: file.type,
      })
      .promise()

    // Generate and upload thumbnail
    let thumbnailKey = null
    let autoThumbnail = false

    // Client sends thumbnail blob alongside video — this is handled in the FormData
    // For the admin UI flow, the thumbnail is generated client-side and sent as a separate field
    if (thumbnailOverride && typeof thumbnailOverride !== 'string') {
      thumbnailKey = `media/thumbnails/${slug}.jpg`
      const thumbBuffer = Buffer.from(await thumbnailOverride.arrayBuffer())
      await s3
        .putObject({
          Bucket: bucketName,
          Key: thumbnailKey,
          Body: thumbBuffer,
          ContentType: 'image/jpeg',
        })
        .promise()
      autoThumbnail = false
    } else {
      // No thumbnail
      autoThumbnail = false
    }

    // Save metadata
    const entry = {
      slug,
      title: title || slug,
      description: description || null,
      thumbnail: thumbnailKey ? `https://${bucketName}.s3.amazonaws.com/${thumbnailKey}` : null,
      publishedAt: now.toISOString(),
      s3Key,
      autoThumbnail,
    }

    await putMediaIndex({
      media: [...index.media, entry],
      updatedAt: now.toISOString(),
    })

    return NextResponse.json({ slug, url: `/media/${slug}` })
  } catch (error) {
    console.error('Media upload error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
})
```

Note: The upload route accepts both `file` and `thumbnail` fields in FormData. The admin UI generates the thumbnail client-side and includes it as `thumbnail`.

- [ ] **Step 3: Write list/delete route**

```js
import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'
import { checkPermission } from '../../../../../../lib/api-permissions'
import { Actions } from '../../../../../../lib/permissions'
import { getMediaIndex, putMediaIndex } from '@/lib/media-s3'

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

export const GET = auth(async function GET(req) {
  if (!req.auth) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const createErr = checkPermission(req, Actions.CREATE_ARTICLE)
  const editErr = checkPermission(req, Actions.EDIT_ARTICLE)
  if (createErr && editErr) {
    return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
  }

  const index = await getMediaIndex()
  return NextResponse.json({ media: index.media })
})

export const DELETE = auth(async function DELETE(req) {
  if (!req.auth) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const createErr = checkPermission(req, Actions.CREATE_ARTICLE)
  const editErr = checkPermission(req, Actions.EDIT_ARTICLE)
  if (createErr && editErr) {
    return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return NextResponse.json({ error: 'Slug requerido' }, { status: 400 })
  }

  const index = await getMediaIndex()
  const entry = index.media.find((m) => m.slug === slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  const s3 = getS3Client()
  const bucket = getBucket()

  // Delete video file
  try {
    await s3.deleteObject({ Bucket: bucket, Key: entry.s3Key }).promise()
  } catch (error) {
    console.error('Failed to delete video file:', error)
  }

  // Delete thumbnail if exists
  if (entry.thumbnail) {
    const thumbKey = entry.thumbnail.replace(`https://${bucket}.s3.amazonaws.com/`, '')
    try {
      await s3.deleteObject({ Bucket: bucket, Key: thumbKey }).promise()
    } catch (error) {
      console.error('Failed to delete thumbnail:', error)
    }
  }

  // Remove from index
  index.media = index.media.filter((m) => m.slug !== slug)
  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)

  return NextResponse.json({ success: true })
})
```

- [ ] **Step 4: Write PUT update route for metadata**

```js
import { auth } from '../../../../../../auth'
import { NextResponse } from 'next/server'
import AWS from 'aws-sdk'
import { checkPermission } from '../../../../../../lib/api-permissions'
import { Actions } from '../../../../../../lib/permissions'
import { getMediaIndex, putMediaIndex } from '@/lib/media-s3'

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

export const PUT = auth(async function PUT(req, { params }) {
  if (!req.auth) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const createErr = checkPermission(req, Actions.CREATE_ARTICLE)
  const editErr = checkPermission(req, Actions.EDIT_ARTICLE)
  if (createErr && editErr) {
    return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
  }

  const { slug } = params
  const index = await getMediaIndex()
  const entry = index.media.find((m) => m.slug === slug)

  if (!entry) {
    return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
  }

  const body = await req.json()
  const { title, description } = body

  if (title !== undefined) entry.title = title
  if (description !== undefined) entry.description = description || null

  index.updatedAt = new Date().toISOString()
  await putMediaIndex(index)

  return NextResponse.json({ slug: entry.slug })
})
```

- [ ] **Step 5: Run tests**

Run: `npx jest test/media-admin.test.js -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/media/
git commit -m "feat(media): add admin API routes for upload/list/delete/update

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Create MediaPlayer component

**Files:**
- Create: `components/MediaPlayer.js`
- Test: `test/media-player.test.js`

- [ ] **Step 1: Write tests**

```js
import { render, screen } from '@testing-library/react'
import MediaPlayer from '@/components/MediaPlayer'

describe('MediaPlayer', () => {
  it('renders video element with correct src', async () => {
    render(<MediaPlayer url="/media/my-video" meta={{ title: 'Test', thumbnail: null }} />)
    const video = screen.getByTitle('Video')
    expect(video).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write component**

```js
'use client'

import { useState } from 'react'

export default function MediaPlayer({ url }) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  // Extract slug from /media/slug
  const slug = url.replace(/^\/media\//, '').replace(/\/$/, '')
  const streamUrl = `/api/media/${slug}/stream`

  if (error) {
    return (
      <div className="w-full aspect-video bg-gray-900 flex items-center justify-center">
        <p className="text-white">Error al cargar el video</p>
        <button
          onClick={() => { setError(false); setLoading(true) }}
          className="ml-4 px-3 py-1 text-sm text-white bg-red-600 rounded"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="w-full">
      {loading && (
        <div className="w-full aspect-video bg-gray-900 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <video
        title="Video"
        controls
        preload="metadata"
        src={streamUrl}
        className={`w-full aspect-video ${loading ? 'hidden' : ''}`}
        onCanPlay={() => setLoading(false)}
        onError={() => setError(true)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

Run: `npx jest test/media-player.test.js -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/MediaPlayer.js test/media-player.test.js
git commit -m "feat(media): add MediaPlayer client component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Update ResponsiveReactPlayer and ComponentInsertMenu

**Files:**
- Modify: `components/ResponsiveReactPlayer.js`
- Modify: `components/admin/ComponentInsertMenu.js`

- [ ] **Step 1: Update ResponsiveReactPlayer**

Find the fallback section (line 50-55) and add before it:

```js
// Internal media URLs
if (url.includes('/media/')) {
  return <MediaPlayer url={url} />
}
```

- [ ] **Step 2: Update ComponentInsertMenu**

Add to the COMPONENTS array:

```js
{
  id: 'media',
  label: 'Media',
  icon: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 3a2 2 0 00-2 2v14a2 2 0 002 2 2 2 0 002-2 2 2 0 00-2-2 2 2 0 00-2-2 2 2 0 00-2 2 2 2 0 00-2-2 2 2 0 00-2 2 2 2 0 002 2 2 2 0 002-2V5a2 2 0 00-2-2 2 2 0 00-2 2 2 2 0 002 2 2 2 0 002-2V5a2 2 0 002 2zm5.5 6l-6 3.87L9 9.87V12l7.5-4.5V9z" />
    </svg>
  ),
  needsUrl: true,
  template: (url) => `<MediaPlayer url="${url}" />`,
  placeholder: '/media/my-video',
},
```

- [ ] **Step 3: Commit**

```bash
git add components/ResponsiveReactPlayer.js components/admin/ComponentInsertMenu.js
git commit -m "feat(media): integrate MediaPlayer with ResponsiveReactPlayer and ComponentInsertMenu

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Create public `/media/[slug]` page

**Files:**
- Create: `app/media/[slug]/page.js`

- [ ] **Step 1: Write page**

```js
import { getMediaEntry } from '@/lib/media-s3'
import MediaPlayer from '@/components/MediaPlayer'

export async function generateMetadata({ params }) {
  const entry = await getMediaEntry(params.slug)
  if (!entry) {
    return { title: 'Video no encontrado' }
  }
  return {
    title: entry.title,
    description: entry.description || null,
  }
}

export default async function MediaPage({ params }) {
  const entry = await getMediaEntry(params.slug)

  if (!entry) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Video no encontrado</h1>
        <p className="text-gray-500">Este video no existe o fue eliminado.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <MediaPlayer url={`/media/${entry.slug}`} />

      <div className="mt-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {entry.title}
        </h1>
        {entry.description && (
          <p className="mt-2 text-gray-600 dark:text-gray-400">{entry.description}</p>
        )}
        <p className="mt-4 text-sm text-gray-500">
          {new Date(entry.publishedAt).toLocaleDateString('es-PR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/media/[slug]/page.js
git commit -m "feat(media): add public video player page at /media/[slug]

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Create admin media manager page

**Files:**
- Create: `app/admin/media/page.js`
- Create: `components/admin/MediaUploadZone.js`
- Create: `components/admin/MediaCard.js`
- Create: `components/admin/MediaEditModal.js`

- [ ] **Step 1: Write admin MediaUploadZone component**

```js
'use client'

import { useRef, useState, useCallback } from 'react'

export default function MediaUploadZone() {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const uploadFile = useCallback(async (file) => {
    setUploading(true)
    setError(null)

    try {
      // Generate thumbnail client-side
      const thumbnailBlob = await generateThumbnail(file)
      const formData = new FormData()
      formData.append('file', file)
      if (thumbnailBlob) {
        formData.append('thumbnail', thumbnailBlob, 'thumbnail.jpg')
      }

      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Error al subir video')
      }

      const { slug, url } = await res.json()
      fileInputRef.current.value = ''
      // Trigger refresh — parent should listen for this
      window.dispatchEvent(new CustomEvent('media-uploaded', { detail: { slug, url } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }, [])

  async function generateThumbnail(videoBlob) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.src = URL.createObjectURL(videoBlob)
      video.currentTime = 1
      video.load()
      video.onloadeddata = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 360
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, 640, 360)
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(video.src)
            resolve(blob)
          },
          'image/jpeg',
          0.85
        )
      }
      video.onerror = () => {
        URL.revokeObjectURL(video.src)
        resolve(null)
      }
    })
  }

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) uploadFile(file)
    },
    [uploadFile]
  )

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
    },
    [uploadFile]
  )

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        dragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
      } ${uploading ? 'opacity-50 cursor-wait' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/mpeg"
        onChange={handleFileChange}
        className="hidden"
      />
      {uploading ? (
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-sm text-gray-500">Subiendo video...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-500">
            Arrastra un video aqui o <span className="text-blue-600">haz clic para buscar</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">MP4, WebM, MOV, AVI, MKV — max 500MB</p>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write MediaCard component**

```js
'use client'

import { useState } from 'react'

export default function MediaCard({ media, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false)

  const handleCopyPermalink = () => {
    const url = `${window.location.origin}/media/${media.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="aspect-video bg-gray-100 dark:bg-gray-900 relative">
        {media.thumbnail ? (
          <img
            src={media.thumbnail}
            alt={media.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 3a2 2 0 00-2 2v14a2 2 0 002 2 2 2 0 002-2 2 2 0 00-2-2 2 2 0 00-2-2 2 2 0 00-2 2 2 2 0 002 2 2 2 0 002-2V5a2 2 0 002 2 2 2 0 002-2 2 2 0 00-2 2 2 2 0 00-2-2V5a2 2 0 002 2zm5.5 6l-6 3.87L9 9.87V12l7.5-4.5V9z" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {media.title}
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {new Date(media.publishedAt).toLocaleDateString('es-PR')}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => onEdit(media)}
            className="flex-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Editar
          </button>
          <button
            onClick={handleCopyPermalink}
            className="flex-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
          <button
            onClick={() => onDelete(media)}
            className="px-2 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write MediaEditModal component**

```js
'use client'

import { useState } from 'react'

export default function MediaEditModal({ media, onSave, onClose }) {
  const [title, setTitle] = useState(media.title || '')
  const [description, setDescription] = useState(media.description || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ slug: media.slug, title, description })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4 w-full">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Editar Video
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titulo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripcion
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          {media.thumbnail && (
            <div className="mb-4">
              <img
                src={media.thumbnail}
                alt={media.title}
                className="w-full aspect-video object-cover rounded"
              />
              <p className="text-xs text-gray-500 mt-1">Miniatura (reemplazar proximamente)</p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write admin media page**

```js
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import MediaUploadZone from '@/components/admin/MediaUploadZone'
import MediaCard from '@/components/admin/MediaCard'
import MediaEditModal from '@/components/admin/MediaEditModal'

export default function AdminMediaPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [mediaList, setMediaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const accessibleActions = session?.user?.accessibleActions || []
  const canManageMedia = accessibleActions.includes('write_articles')

  useEffect(() => {
    if (session && !canManageMedia) {
      router.push('/admin')
    }
  }, [session, canManageMedia, router])

  const fetchMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media')
      if (res.ok) {
        const data = await res.json()
        setMediaList(data.media || [])
      }
    } catch (error) {
      console.error('Failed to fetch media:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session && canManageMedia) {
      fetchMedia()
    }
  }, [session, canManageMedia, fetchMedia])

  useEffect(() => {
    window.addEventListener('media-uploaded', fetchMedia)
    return () => window.removeEventListener('media-uploaded', fetchMedia)
  }, [fetchMedia])

  const handleEdit = async ({ slug, title, description }) => {
    const res = await fetch(`/api/admin/media/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
    if (res.ok) {
      await fetchMedia()
      setEditTarget(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/admin/media?slug=${deleteTarget.slug}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      await fetchMedia()
      setDeleteTarget(null)
    }
  }

  if (!session || !canManageMedia) {
    return null
  }

  return (
    <div className="max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Media</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona videos para insertar en articulos y compartir via permalink.
        </p>
      </div>

      <div className="mb-8">
        <MediaUploadZone />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg aspect-video animate-pulse" />
          ))}
        </div>
      ) : mediaList.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No hay videos todavia. Sube tu primer video arriba.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {mediaList.map((m) => (
            <MediaCard
              key={m.slug}
              media={m}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {editTarget && (
        <MediaEditModal
          media={editTarget}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Eliminar video
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Seguro que deseas eliminar "{deleteTarget.title}"? Esta accion no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/media/page.js components/admin/MediaUploadZone.js components/admin/MediaCard.js components/admin/MediaEditModal.js
git commit -m "feat(media): add admin media manager page with upload zone and grid

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Add media to admin navigation

**Files:**
- Modify: `components/admin/AdminSidebar.js:102`

- [ ] **Step 1: Add media nav item to navItems array**

Find the `guides` nav item (around line 83) and add after it:

```js
{
  href: '/admin/media',
  label: 'Media',
  feature: 'media',
  icon: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path d="M18 3a2 2 0 00-2 2v14a2 2 0 002 2 2 2 0 002-2 2 2 0 00-2-2 2 2 0 00-2-2 2 2 0 00-2 2 2 2 0 002 2 2 2 0 002-2V5a2 2 0 002 2 2 2 0 002-2 2 2 0 00-2 2 2 2 0 00-2-2V5a2 2 0 002 2zm5.5 6l-6 3.87L9 9.87V12l7.5-4.5V9z" />
    </svg>
  ),
},
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/AdminSidebar.js
git commit -m "feat(media): add media nav item to admin sidebar

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Discard old video upload work

**Files:**
- Delete: `app/api/admin/articles/upload-video/route.js`
- Delete: `components/admin/VideoUploadButton.js`
- Modify: `app/admin/articles/new/page.js`
- Modify: `app/admin/articles/edit/[...slug]/page.js`

- [ ] **Step 1: Delete old files**

```bash
rm app/api/admin/articles/upload-video/route.js
rm components/admin/VideoUploadButton.js
```

- [ ] **Step 2: Remove VideoUploadButton imports from article pages**

In `app/admin/articles/new/page.js`, remove the line:
```js
import VideoUploadButton from '@/components/admin/VideoUploadButton'
```

And remove `<VideoUploadButton editorRef={editorRef} />` from toolbarExtra.

In `app/admin/articles/edit/[...slug]/page.js`, remove the same two things.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(media): discard old video upload work, use new media manager

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Public `/media/[slug]` page with embedded player
- [x] `/api/media/[slug]/meta` and `/stream` endpoints
- [x] Admin upload/list/delete/update routes
- [x] Client-side thumbnail generation + upload
- [x] Admin grid UI with edit/delete/copy permalink
- [x] MediaPlayer component with error state and loading
- [x] ResponsiveReactPlayer routing for `/media/` URLs
- [x] ComponentInsertMenu "Media" option
- [x] Admin sidebar nav item
- [x] Permissions: media feature added
- [x] Discard old upload-video route

**2. Placeholder scan:** No TBD/TODO. All step content complete.

**3. Type consistency:** Slug is generated and passed consistently through all tasks. S3 key format consistent. API response shapes consistent.