# Media Manager — Design Spec

## Overview

A self-hosted video management tool for the SAC website. Videos are uploaded to S3, managed through a new admin tab, and embedded into articles via a permalink system. Videos are streamed through a dedicated endpoint — S3 URLs are never exposed to end users.

## URL Structure

| Route | Purpose |
|-------|---------|
| `/media/[slug]` | Embedded video player page (public) |
| `/media/[slug]/download` | File download/stream (public) |
| `/api/media/[slug]/stream` | Internal streaming proxy to S3 (public) |
| `/api/media/[slug]/meta` | Video metadata JSON (public) |
| `/admin/media` | Admin tab for upload/manage (auth required) |

## Storage

### S3 Layout (same bucket as images — `S3_IMAGES_BUCKET_NAME`)

```
media/
  videos/{year}/{month}/{day}/{slug}.{ext}   # video file
  thumbnails/{slug}.jpg                      # thumbnail image
  index.json                                  # metadata index
```

### Metadata Index (`index.json`)

```json
{
  "media": [
    {
      "slug": "my-video",
      "title": "string",
      "description": "string (optional)",
      "thumbnail": "/media/thumbnails/slug.jpg",
      "publishedAt": "ISO date",
      "s3Key": "media/videos/...",
      "autoThumbnail": true
    }
  ],
  "updatedAt": "ISO date"
}
```

Each video entry is immediately live upon upload — no draft/published state. A video either exists or does not exist.

## Public Pages

### `/media/[slug]` — Embedded Player Page

Layout matches blog article pages (same header, footer, spacing, typography).

Content:
- Video player (full width, max 16:9 aspect ratio)
- Title
- Description (if set)
- Publication date

Uses `MediaPlayer` client component to stream from `/api/media/[slug]/stream`.

### `/media/[slug]/download`

Redirects to `/api/media/[slug]/stream` with `Content-Disposition: attachment` header for direct download.

## API Routes

### `GET /api/media/[slug]/meta`

Returns metadata JSON for a given slug.

**Response 200:**
```json
{
  "slug": "my-video",
  "title": "...",
  "description": "...",
  "thumbnail": "/media/thumbnails/slug.jpg",
  "publishedAt": "ISO date"
}
```

**Response 404:** `{ "error": "Video no encontrado" }`

### `GET /api/media/[slug]/stream`

Proxies video stream from S3 with HTTP range support for seeking.

**Request:** Accepts `Range` header (standard browser seeking).

**Response:** Streams video bytes with headers:
- `Content-Type: video/mp4` (or detected MIME type)
- `Accept-Ranges: bytes`
- `Content-Length` (or `Content-Range` for partial responses)

**Response 404:** `{ "error": "Video no encontrado" }`

### `POST /api/admin/media/upload`

Admin-only (same `write_articles` permission as article manager).

**Request:** `FormData` with `file` field.

**Validations:**
- MIME type: `video/mp4`, `video/webm`, `video/quicktime`, `video/x-msvideo`, `video/x-matroska`, `video/mpeg`
- Max size: 500MB (larger than the 10MB image limit, since videos are the primary use case)

**Process:**
1. Validate file type and size (client-side before upload)
2. Generate slug from sanitized filename (remove extension, lowercase, hyphenate)
3. If slug collides, append numeric suffix (`my-video-2`)
4. Auto-generate thumbnail client-side: load video in `<video>` element, seek to 1s, draw canvas frame, export as JPEG
5. Upload both video and thumbnail to S3 in parallel:
   - Video: `media/videos/YYYY/MM/DD/slug.ext`
   - Thumbnail: `media/thumbnails/slug.jpg`
6. Add entry to `index.json`

**Response 200:** `{ "slug": "...", "url": "/media/my-video" }`

**Response 400:** `{ "error": "..." }` (invalid type, too large, no file)

**Response 401/403:** Auth/permission errors

### `PUT /api/admin/media/[slug]`

Admin-only. Updates metadata (title, description, thumbnail override).

**Request:**
```json
{
  "title": "string",
  "description": "string (optional)",
  "thumbnailOverride": true  // if true, expects thumbnail file in FormData
}
```

**Response 200:** `{ "slug": "..." }`

### `DELETE /api/admin/media/[slug]`

Admin-only. Deletes video file, thumbnail, and index entry.

**Response 200:** `{ "success": true }`

**Response 404:** `{ "error": "Video no encontrado" }`

## Admin UI — `/admin/media`

### Permission

Same as article manager: `write_articles` (or `write_*` super-permission).

### Layout

New tab in admin sidebar under "Contenido" alongside Articles and Guides.

### Upload Section (top of page)

- Drag & drop zone or click-to-browse file picker
- Accepts same formats as upload endpoint
- Progress indicator during upload
- On success: card appears in grid, permalink shown

### Grid View (main content)

- Card per video: thumbnail (jpg), title, date
- Card actions: Edit, Delete, Copy permalink
- Empty state: "No hay videos todavia. Sube tu primer video above."

### Edit Modal

- Title field (required)
- Description textarea (optional)
- Thumbnail section: shows auto-generated thumbnail with "Replace" button to upload override
- Save / Cancel buttons

### Delete Confirmation

- Modal: "Eliminar este video? Esta accion no se puede deshacer."
- Confirm / Cancel buttons

## Article Embedding

### ComponentInsertMenu

New entry:

```
{
  id: 'media',
  label: 'Media',
  icon: <video icon>,
  needsUrl: true,
  template: (url) => `<MediaPlayer url="${url}" />`,
  placeholder: '/media/my-video',
}
```

User pastes `/media/my-video` (or full URL `https://sac.org/media/my-video`), component inserts `<MediaPlayer url="/media/my-video" />`.

URL validation: must contain `/media/` to be treated as internal media.

### MediaPlayer Component

`components/MediaPlayer.js`

Client component that:
1. Fetches metadata from `/api/media/[slug]/meta` (server-side render fetches at build time)
2. Renders native HTML5 `<video>` element with:
   - `controls`, `preload="metadata"`
   - `src` pointing to `/api/media/[slug]/stream`
   - Max-width 100%, 16:9 aspect ratio via `pb-[56.25%]`
3. Shows loading spinner while video loads
4. Shows error state if stream fails

### ResponsiveReactPlayer Update

Add a detection branch for `/media/` URLs before the fallback link:

```js
if (url.includes('/media/')) {
  return <MediaPlayer url={url} />
}
```

## Thumbnail Generation

Auto-generated client-side using `<video>` element + Canvas API:

1. Load video file in `<video>` element
2. Seek to `1s` (or first frame if video is shorter)
3. Draw video frame to canvas at 640x360
4. `canvas.toBlob('image/jpeg', 0.85)`
5. Upload JPEG to S3

If auto-thumbnail fails (video too short, decode error), set `autoThumbnail: false` and no thumbnail shown.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Video slug not found | 404 page, "Video no encontrado" |
| Stream fails | MediaPlayer shows error state, retry button |
| Upload type/size invalid | Error shown inline near upload zone |
| S3 upload fails | Error shown inline, file not added to index |
| Thumbnail generation fails | Continue without thumbnail, `autoThumbnail: false` |
| Duplicate slug | Append numeric suffix automatically |

## Environment Variables

No new environment variables required. Uses existing:
- `S3_IMAGES_BUCKET_NAME`
- `AWS_REGION`
- `AWS_S3_ENDPOINT` (for LocalStack dev)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`

## Existing Code Changes

- `components/ResponsiveReactPlayer.js` — add `/media/` detection branch
- `components/admin/ComponentInsertMenu.js` — add "Media" option
- `app/admin/articles/new/page.js` — remove VideoUploadButton import (being discarded)
- `app/admin/articles/edit/[...slug]/page.js` — remove VideoUploadButton import (being discarded)

## Discarded Work

The `upload-video` route and `VideoUploadButton` component created during the initial request are discarded. Video uploads flow through the new `/admin/media` tab instead.