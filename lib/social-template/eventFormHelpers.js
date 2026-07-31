/**
 * Client/server helpers for the event-first generation form.
 * Pure functions — unit-testable without React or Node APIs.
 */

import {
  OBSERVATION_NIGHT_CONTENT_TYPE,
  OBSERVATION_NIGHT_LABEL,
  isEventContentType,
} from '../ai-constants'

export const EVENT_WEATHER_DISCLAIMER = '*Actividad sujeta a las condiciones del tiempo.'

export const SPONSOR_MAX_BYTES = 2 * 1024 * 1024
export const SPONSOR_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

const WEEKDAY_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MONTH_SHORT = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
]

/**
 * Format a canonical YYYY-MM-DD date for Puerto Rico event cards.
 * Falls back to the original string when not parseable as ISO date.
 * @param {string} value
 * @returns {string|undefined}
 */
export function formatEventDateLabel(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return undefined

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!isoMatch) return raw

  const year = Number(isoMatch[1])
  const month = Number(isoMatch[2])
  const day = Number(isoMatch[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return raw
  }

  const weekday = WEEKDAY_SHORT[date.getUTCDay()]
  const monthLabel = MONTH_SHORT[month - 1]
  return `${weekday} ${String(day).padStart(2, '0')} ${monthLabel}`
}

/**
 * Format a canonical HH:MM (24h) time as 12-hour label, or pass through free text.
 * @param {string} value
 * @returns {string|undefined}
 */
export function formatEventTimeLabel(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return undefined

  const match = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return raw

  let hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return raw
  }

  const period = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`
}

/**
 * Resolve the event name without allowing one execution to overwrite the approved type label.
 * @param {object} formState
 * @returns {string}
 */
export function resolveEventName(formState) {
  if (formState.contentType === OBSERVATION_NIGHT_CONTENT_TYPE) {
    return OBSERVATION_NIGHT_LABEL
  }
  return (formState.eventName || '').trim()
}

/**
 * Build event details while preserving content-type identity.
 * @param {object} formState
 * @returns {{ name: string, date?: string, time?: string, location?: string } | undefined}
 */
export function buildEventDetails(formState) {
  if (!isEventContentType(formState.contentType)) return undefined

  const details = { name: resolveEventName(formState) }
  if (formState.eventDate?.trim()) details.date = formState.eventDate.trim()
  if (formState.eventTime?.trim()) details.time = formState.eventTime.trim()
  if (formState.eventLocation?.trim()) details.location = formState.eventLocation.trim()
  return details
}

/**
 * Derive workflow topic/intent for event-oriented content so the UI can omit those fields.
 * @param {object} formState
 * @returns {{ topic: string, intent: string }}
 */
export function deriveEventTopicAndIntent(formState) {
  const name = resolveEventName(formState)
  const location = (formState.eventLocation || '').trim()
  const dateLabel = formatEventDateLabel(formState.eventDate) || (formState.eventDate || '').trim()
  const timeLabel = formatEventTimeLabel(formState.eventTime) || (formState.eventTime || '').trim()

  const logistics = [dateLabel, timeLabel, location].filter(Boolean).join(' · ')
  const intent = location
    ? `Invitar al público a ${name} en ${location}`
    : `Invitar al público a ${name}`

  return {
    topic: logistics ? `${name} — ${logistics}` : name,
    intent,
  }
}

/**
 * @param {string} mimeType
 * @returns {boolean}
 */
export function isAllowedSponsorMimeType(mimeType) {
  const normalized = String(mimeType || '')
    .trim()
    .toLowerCase()
  return SPONSOR_ALLOWED_MIME_TYPES.includes(normalized)
}

/**
 * Validate a sponsor logo data URL (size + mime).
 * @param {{ dataUrl?: string, mimeType?: string }} sponsorLogo
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateSponsorLogo(sponsorLogo) {
  if (!sponsorLogo) return { ok: true }
  if (typeof sponsorLogo !== 'object') {
    return { ok: false, error: 'Logo de auspiciador inválido' }
  }

  const dataUrl = typeof sponsorLogo.dataUrl === 'string' ? sponsorLogo.dataUrl.trim() : ''
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/)
  if (!match) {
    return { ok: false, error: 'Logo de auspiciador inválido' }
  }

  const headerMime = normalizeImageMime(match[1])
  const declaredMime = sponsorLogo.mimeType ? normalizeImageMime(sponsorLogo.mimeType) : headerMime
  if (!isAllowedSponsorMimeType(headerMime) || !isAllowedSponsorMimeType(declaredMime)) {
    return { ok: false, error: 'El logo debe ser PNG, JPEG o WebP' }
  }

  if (headerMime !== declaredMime) {
    return { ok: false, error: 'El tipo del archivo no coincide con su contenido' }
  }

  const base64 = match[2]
  if (!base64 || base64.length % 4 !== 0) {
    return { ok: false, error: 'Logo de auspiciador inválido' }
  }

  // Approximate decoded size from base64 length
  const padding = (base64.match(/=+$/) || [''])[0].length
  const bytes = Math.floor((base64.length * 3) / 4) - padding
  if (bytes <= 0) {
    return { ok: false, error: 'Logo de auspiciador inválido' }
  }
  if (bytes > SPONSOR_MAX_BYTES) {
    return { ok: false, error: 'El logo no puede superar 2 MB' }
  }

  return { ok: true }
}

function normalizeImageMime(value) {
  const mime = String(value || '')
    .trim()
    .toLowerCase()
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}

/**
 * Required logistics for event-oriented content.
 * @param {object} eventDetails
 * @param {string} cta
 * @returns {string[]} missing field labels
 */
export function missingEventLogistics(eventDetails, cta) {
  const missing = []
  if (!String(eventDetails?.name || '').trim()) missing.push('nombre')
  if (!String(eventDetails?.date || '').trim()) missing.push('fecha')
  if (!String(eventDetails?.time || '').trim()) missing.push('hora')
  if (!String(eventDetails?.location || '').trim()) missing.push('lugar')
  if (!String(cta || '').trim()) missing.push('CTA')
  return missing
}
