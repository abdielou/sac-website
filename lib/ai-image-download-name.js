import { isEventContentType } from './ai-constants'

const MAX_SUBJECT_LENGTH = 80
const CONTENT_TYPE_FILE_SLUGS = {
  observation_night: 'noche-observacion',
  regular_post: 'publicacion',
  caption: 'caption',
  image_post: 'publicacion-imagen',
  carousel: 'carrusel',
  reel_caption: 'caption-reel',
  event_promotion: 'evento',
  educational_astronomy: 'educacion',
  member_update: 'actualizacion-miembros',
}

function slugifyPart(value, maxLength = MAX_SUBJECT_LENGTH) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')

  return slug || null
}

function validIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? match[0]
    : null
}

function generatedIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10)
}

function extensionForMimeType(mimeType) {
  const normalized = String(mimeType || '')
    .split(';')[0]
    .toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg'
  if (normalized === 'image/webp') return 'webp'
  return 'png'
}

/**
 * Produce a descriptive, cross-platform-safe file name for generated SAC artwork.
 * Event dates take precedence; other content uses its generation date.
 */
export function buildAiImageDownloadFileName({
  contentType,
  eventDetails,
  topic,
  mimeType,
  generatedAt,
} = {}) {
  const isEvent = isEventContentType(contentType)
  const typeSlug =
    CONTENT_TYPE_FILE_SLUGS[contentType] || slugifyPart(contentType, 50) || 'publicacion'
  const date = (isEvent && validIsoDate(eventDetails?.date)) || generatedIsoDate(generatedAt)
  const subject = isEvent ? eventDetails?.location || eventDetails?.name || topic : topic
  const subjectSlug = slugifyPart(subject)
  const parts = isEvent
    ? ['SAC', typeSlug, date, subjectSlug]
    : ['SAC', typeSlug, subjectSlug, date]
  const stem = parts.filter(Boolean).join('-')

  return `${stem}.${extensionForMimeType(mimeType)}`
}
