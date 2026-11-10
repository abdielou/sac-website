/**
 * Manual guide objects: objects that an editor types in because the bundled
 * catalog does not have them (planets, comets, events, missing deep-sky objects).
 *
 * A manual entry keeps its object data inline in `entry.manual`. These helpers
 * have no server imports, so the admin form and the guide API share them.
 */

/** Type suggestions shown in the admin form. The field stays free text. */
export const MANUAL_OBJECT_TYPES = [
  'Planeta',
  'Luna',
  'Cometa',
  'Asteroide',
  'Estrella',
  'Asterismo',
  'Evento',
  'Galaxia',
  'Nebulosa',
  'Cúmulo',
]

const MANUAL_ID_PATTERN = /^manual-[a-z0-9]+$/
const LOCAL_IMAGE_PATTERN = /^\/local-s3\/[A-Za-z0-9._\-/]+$/

const MAX_NAME = 120
const MAX_SHORT_TEXT = 60
const MAX_CREDIT = 120
const MAX_URL = 2048
const MAGNITUDE_LIMIT = 30

/** True when `id` has the `manual-<random>` form. */
export function isManualObjectId(id) {
  return typeof id === 'string' && MANUAL_ID_PATTERN.test(id)
}

/** A new unique id for a manual entry, for example `manual-lq2x8k4f9a1c`. */
export function newManualObjectId() {
  const random = Math.random().toString(36).slice(2, 8) || '0'
  return `manual-${Date.now().toString(36)}${random}`
}

function inRange(value, axis) {
  if (axis === 'ra') return value >= 0 && value < 360
  return value >= -90 && value <= 90
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6
}

/**
 * Parse a right ascension or declination typed by an editor.
 *
 * One plain number is decimal degrees. Two or three numbers, or any of the
 * marks h m s ° ′ ″ ' " :, are sexagesimal: hours for RA, degrees for Dec.
 * A leading sign applies to the whole value, so "-00 30 00" is -0.5.
 *
 * @param {string|number|null} input
 * @param {'ra'|'dec'} axis
 * @returns {number|null} Decimal degrees, or null when empty, invalid, or out of range
 */
export function parseCoordinate(input, axis) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && inRange(input, axis) ? input : null
  }
  if (typeof input !== 'string') return null

  let text = input.trim()
  if (!text) return null

  let sign = 1
  if (text[0] === '+' || text[0] === '-') {
    if (text[0] === '-') sign = -1
    text = text.slice(1).trim()
  }

  const hasMarks = /[hms°′″'":]/i.test(text)
  const parts = text
    .replace(/[hms°′″'":]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0 || parts.length > 3) return null
  if (!parts.every((part) => /^(\d+\.?\d*|\.\d+)$/.test(part))) return null

  const numbers = parts.map(Number)
  let value

  if (parts.length === 1 && !hasMarks) {
    value = numbers[0]
  } else {
    const [whole, minutes = 0, seconds = 0] = numbers
    if (minutes >= 60 || seconds >= 60) return null
    value = whole + minutes / 60 + seconds / 3600
    if (axis === 'ra') value *= 15
  }

  value = round6(sign * value)
  if (Object.is(value, -0)) value = 0
  return inRange(value, axis) ? value : null
}

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isBlank(value) {
  return value === null || value === undefined || cleanText(value) === ''
}

function checkImageUrl(url, allowLocalImages) {
  if (url.length > MAX_URL) return 'La URL de la imagen es demasiado larga.'
  if (allowLocalImages && LOCAL_IMAGE_PATTERN.test(url) && !url.includes('..')) return null
  try {
    if (new URL(url).protocol === 'https:') return null
  } catch {
    // Not an absolute URL. Fall through to the error.
  }
  return 'La imagen debe ser una URL que empiece con https://.'
}

/**
 * Validate and clean the `manual` block of one guide entry.
 *
 * Strings are trimmed, numbers are parsed, coordinates become decimal degrees,
 * and empty or unknown fields are dropped. Messages are in Spanish because the
 * admin form shows them as they are.
 *
 * @param {string} objectId - The entry's objectId
 * @param {Object} manual - The raw manual block
 * @param {Object} [options]
 * @param {boolean} [options.allowLocalImages] - Accept `/local-s3/` image paths (S3 stub)
 * @returns {{ok: true, value: Object} | {ok: false, errors: Object}}
 */
export function validateManualObject(objectId, manual, { allowLocalImages = false } = {}) {
  const errors = {}
  const value = {}

  if (!isManualObjectId(objectId)) {
    errors.objectId = 'Identificador de objeto manual inválido.'
  }

  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) {
    errors.name = 'El nombre del objeto es obligatorio.'
    return { ok: false, errors }
  }

  const name = cleanText(manual.name)
  if (!name) errors.name = 'El nombre del objeto es obligatorio.'
  else if (name.length > MAX_NAME)
    errors.name = `El nombre admite ${MAX_NAME} caracteres como máximo.`
  else value.name = name

  for (const field of ['designation', 'objectType', 'constellation']) {
    const text = cleanText(manual[field])
    if (!text) continue
    if (text.length > MAX_SHORT_TEXT) {
      errors[field] = `Este campo admite ${MAX_SHORT_TEXT} caracteres como máximo.`
    } else {
      value[field] = text
    }
  }

  if (!isBlank(manual.magnitude)) {
    const magnitude = Number(cleanText(manual.magnitude))
    if (!Number.isFinite(magnitude) || Math.abs(magnitude) > MAGNITUDE_LIMIT) {
      errors.magnitude = `La magnitud debe ser un número entre -${MAGNITUDE_LIMIT} y ${MAGNITUDE_LIMIT}.`
    } else {
      value.magnitude = magnitude
    }
  }

  const hasRa = !isBlank(manual.ra)
  const hasDec = !isBlank(manual.dec)
  if (hasRa || hasDec) {
    const ra = hasRa ? parseCoordinate(manual.ra, 'ra') : null
    const dec = hasDec ? parseCoordinate(manual.dec, 'dec') : null
    if (!hasRa) errors.ra = 'Indica la AR y la Dec, o deja ambas vacías.'
    else if (ra === null) errors.ra = 'AR inválida. Usa grados (150.2) o horas (10 00 48).'
    if (!hasDec) errors.dec = 'Indica la AR y la Dec, o deja ambas vacías.'
    else if (dec === null)
      errors.dec = 'Dec inválida. Usa grados (12.3) o grados minutos segundos (+12 18 00).'
    if (ra !== null && dec !== null) {
      value.ra = ra
      value.dec = dec
    }
  }

  const imageUrl = cleanText(manual.imageUrl)
  if (imageUrl) {
    const urlError = checkImageUrl(imageUrl, allowLocalImages)
    if (urlError) errors.imageUrl = urlError
    else value.imageUrl = imageUrl
  }

  const imageCredit = cleanText(manual.imageCredit)
  if (imageCredit) {
    if (imageCredit.length > MAX_CREDIT) {
      errors.imageCredit = `El crédito admite ${MAX_CREDIT} caracteres como máximo.`
    } else {
      value.imageCredit = imageCredit
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value }
}

/**
 * Validate the manual entries of a guide before it is saved.
 *
 * Catalog entries pass through unchanged. Each manual entry gets its cleaned
 * `manual` block. An entry with a `manual-` id but no block is an error, because
 * the public page could not resolve it.
 *
 * @param {Array|undefined} entries
 * @param {Object} [options] - Passed to validateManualObject()
 * @returns {{ok: true, entries: Array|undefined} | {ok: false, error: string, details: string}}
 */
export function validateGuideEntries(entries, options = {}) {
  if (entries === undefined) return { ok: true, entries }
  if (!Array.isArray(entries)) {
    return { ok: false, error: 'Objetos de la guía inválidos', details: 'entries must be an array' }
  }

  const cleaned = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry?.manual && !isManualObjectId(entry?.objectId)) {
      cleaned.push(entry)
      continue
    }

    const result = validateManualObject(entry.objectId, entry.manual, options)
    if (!result.ok) {
      const [field, message] = Object.entries(result.errors)[0]
      return {
        ok: false,
        error: `Objeto manual ${i + 1} inválido: ${message}`,
        details: `entries[${i}].manual.${field} is invalid`,
      }
    }
    cleaned.push({ ...entry, manual: result.value })
  }

  return { ok: true, entries: cleaned }
}

/**
 * Map a manual block to the catalog record shape that the guide cards read.
 *
 * The catalog keeps the designation in `name` ("M 45") and the display name in
 * `commonNameEs` ("Pléyades"). The manual data uses the same split, so card,
 * sort, and SEO code need no special case.
 *
 * @param {Object|null|undefined} manual
 * @returns {Object|null}
 */
export function manualToCatalog(manual) {
  if (!manual) return null
  return {
    id: null,
    name: manual.designation || '',
    commonNameEs: manual.name,
    objectType: manual.objectType ?? null,
    constellation: manual.constellation ?? null,
    magnitude: manual.magnitude ?? null,
    ra: manual.ra ?? null,
    dec: manual.dec ?? null,
  }
}
