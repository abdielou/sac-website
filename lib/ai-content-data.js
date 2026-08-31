import { GENERATION_INPUT_LIMITS } from './ai-constants'
import { FIELD_LIBRARY } from './ai-guidelines-schema'
import { validateSponsorLogo } from './social-template/eventFormHelpers'

const EVENT_FIELD_KEYS = Object.freeze(['event_name', 'date', 'time', 'location'])
const SPONSOR_KEYS = Object.freeze(['dataUrl', 'mimeType', 'fileName'])

const DIRECT_LEGACY_KEYS = Object.freeze({
  intent: 'intent',
  topic: 'topic',
  cta: 'cta',
  tone: 'tone',
  audience: 'audience',
  known_facts: 'knownFacts',
  hashtags: 'hashtags',
  links: 'links',
  image_style: 'imageStyle',
  image_constraints: 'imageConstraints',
  sponsor: 'sponsorLogo',
})

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function normalizeLegacyScalar(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return value
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeLegacyList(value) {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter((item) => item !== '')
  }
  if (typeof value !== 'string') return value

  const normalized = value.trim()
  if (!normalized) return undefined

  try {
    const parsed = JSON.parse(normalized)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter((item) => item !== '')
    }
  } catch {
    // Legacy form fields also use newline- and comma-separated lists.
  }

  return normalized
    .split(normalized.includes('\n') ? /\r?\n/ : ',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function cloneSponsor(value) {
  return isPlainObject(value) ? { ...value } : value
}

function selectedFields(definition) {
  return Array.isArray(definition?.fields) ? definition.fields : []
}

function readLegacyValue(input, key, definition) {
  const eventDetails = isPlainObject(input?.eventDetails) ? input.eventDetails : {}

  switch (key) {
    case 'event_name':
      return firstPresent(input?.eventName, eventDetails.name)
    case 'date':
      return firstPresent(input?.eventDate, eventDetails.date)
    case 'time':
      return firstPresent(input?.eventTime, eventDetails.time)
    case 'location':
      return firstPresent(input?.eventLocation, eventDetails.location)
    case 'cta': {
      const usesEventFields = selectedFields(definition).some(({ key: fieldKey }) =>
        EVENT_FIELD_KEYS.includes(fieldKey)
      )
      return usesEventFields
        ? firstPresent(input?.eventCta, input?.cta, eventDetails.cta)
        : firstPresent(input?.cta, input?.eventCta, eventDetails.cta)
    }
    case 'known_facts':
      return normalizeLegacyList(input?.knownFacts)
    case 'hashtags':
      return normalizeLegacyList(input?.hashtags)
    case 'links':
      return normalizeLegacyList(input?.links)
    case 'sponsor':
      return cloneSponsor(input?.sponsorLogo)
    default: {
      const legacyKey = DIRECT_LEGACY_KEYS[key]
      return normalizeLegacyScalar(legacyKey ? input?.[legacyKey] : undefined)
    }
  }
}

/**
 * Converts the existing API/form shapes into the fields selected by one
 * content-type definition. Unselected legacy values are intentionally ignored.
 */
export function legacyInputToContentData(input, definition) {
  const source = isPlainObject(input) ? input : {}
  const contentData = {}

  for (const field of selectedFields(definition)) {
    const key = field?.key
    if (!FIELD_LIBRARY[key]) continue
    const value = readLegacyValue(source, key, definition)
    const normalized = ['known_facts', 'hashtags', 'links'].includes(key)
      ? normalizeLegacyList(value)
      : key === 'sponsor'
        ? cloneSponsor(value)
        : normalizeLegacyScalar(value)
    if (normalized !== undefined) contentData[key] = normalized
  }

  return contentData
}

function isMissingValue(value, inputType) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  if (inputType === 'list') return Array.isArray(value) && value.length === 0
  return false
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false
  const [hours, minutes] = value.split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

function validateTextValue(key, value, libraryEntry, errors) {
  if (typeof value !== 'string') {
    errors.push(`contentData.${key} debe ser texto.`)
    return undefined
  }

  const normalized = value.trim()
  if (libraryEntry.maxLength && normalized.length > libraryEntry.maxLength) {
    errors.push(`contentData.${key} admite hasta ${libraryEntry.maxLength} caracteres.`)
  }
  if (libraryEntry.inputType === 'date' && !isValidIsoDate(normalized)) {
    errors.push(`contentData.${key} debe ser una fecha válida en formato YYYY-MM-DD.`)
  }
  if (libraryEntry.inputType === 'time' && !isValidTime(normalized)) {
    errors.push(`contentData.${key} debe ser una hora válida en formato HH:MM.`)
  }
  return normalized
}

function validateListValue(key, value, libraryEntry, errors) {
  if (!Array.isArray(value)) {
    errors.push(`contentData.${key} debe ser una lista.`)
    return undefined
  }
  if (value.length > libraryEntry.maxItems) {
    errors.push(`contentData.${key} admite hasta ${libraryEntry.maxItems} elementos.`)
  }

  const normalized = []
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      errors.push(`contentData.${key}[${index}] debe ser texto no vacío.`)
      return
    }
    const text = item.trim()
    if (text.length > libraryEntry.itemMaxLength) {
      errors.push(
        `contentData.${key}[${index}] admite hasta ${libraryEntry.itemMaxLength} caracteres.`
      )
    }
    normalized.push(text)
  })
  return normalized
}

function validateSponsorValue(key, value, errors) {
  if (!isPlainObject(value)) {
    errors.push(`contentData.${key} debe ser una imagen de auspiciador.`)
    return undefined
  }

  for (const property of Object.keys(value)) {
    if (!SPONSOR_KEYS.includes(property)) {
      errors.push(`contentData.${key} contiene la propiedad no permitida "${property}".`)
    }
  }

  if (typeof value.dataUrl !== 'string' || !value.dataUrl.trim()) {
    errors.push(`contentData.${key}.dataUrl es obligatorio.`)
    return undefined
  }
  if (value.mimeType != null && typeof value.mimeType !== 'string') {
    errors.push(`contentData.${key}.mimeType debe ser texto.`)
  }
  if (value.fileName != null && typeof value.fileName !== 'string') {
    errors.push(`contentData.${key}.fileName debe ser texto.`)
  }

  const sponsor = {
    dataUrl: value.dataUrl.trim(),
    ...(typeof value.mimeType === 'string' && value.mimeType.trim()
      ? { mimeType: value.mimeType.trim().toLowerCase() }
      : {}),
    ...(typeof value.fileName === 'string' && value.fileName.trim()
      ? { fileName: value.fileName.trim() }
      : {}),
  }
  if (sponsor.fileName?.length > GENERATION_INPUT_LIMITS.sponsorFileName) {
    errors.push(
      `contentData.${key}.fileName admite hasta ${GENERATION_INPUT_LIMITS.sponsorFileName} caracteres.`
    )
  }

  const validation = validateSponsorLogo(sponsor)
  if (!validation.ok) errors.push(`contentData.${key}: ${validation.error}.`)
  return sponsor
}

/**
 * Strictly validates and normalizes contentData against definition.fields.
 * Globally supported fields that were not selected by the definition are rejected.
 */
export function validateContentData(contentData, definition) {
  const errors = []
  const data = {}
  if (!isPlainObject(contentData)) {
    return { ok: false, errors: ['contentData debe ser un objeto.'], data }
  }

  const fields = selectedFields(definition)
  if (!Array.isArray(definition?.fields)) {
    return { ok: false, errors: ['definition.fields debe ser una lista.'], data }
  }

  const fieldsByKey = new Map()
  for (const field of fields) {
    const key = field?.key
    if (!FIELD_LIBRARY[key]) {
      errors.push(`La definición usa el campo no soportado "${key || ''}".`)
      continue
    }
    if (fieldsByKey.has(key)) {
      errors.push(`La definición repite el campo "${key}".`)
      continue
    }
    fieldsByKey.set(key, field)
  }

  for (const key of Object.keys(contentData)) {
    if (!fieldsByKey.has(key)) {
      errors.push(`contentData contiene la clave no permitida "${key}".`)
    }
  }

  for (const [key, field] of fieldsByKey) {
    const libraryEntry = FIELD_LIBRARY[key]
    const value = contentData[key]
    if (isMissingValue(value, libraryEntry.inputType)) {
      if (field.required) errors.push(`contentData.${key} es obligatorio.`)
      continue
    }

    let normalized
    if (libraryEntry.inputType === 'list') {
      normalized = validateListValue(key, value, libraryEntry, errors)
    } else if (libraryEntry.inputType === 'image') {
      normalized = validateSponsorValue(key, value, errors)
    } else {
      normalized = validateTextValue(key, value, libraryEntry, errors)
    }
    if (normalized !== undefined) data[key] = normalized
  }

  return { ok: errors.length === 0, errors, data }
}

export function resolveContentTitle(contentData, definition) {
  switch (definition?.titleSource) {
    case 'type_label':
      return normalizeLegacyScalar(definition?.label)
    case 'event_name':
      return normalizeLegacyScalar(contentData.event_name)
    case 'topic':
      return normalizeLegacyScalar(contentData.topic)
    default:
      return undefined
  }
}

function assignIfPresent(target, key, value) {
  if (value !== undefined) target[key] = value
}

/**
 * Converts validated contentData back to the current workflow shape. Identity and
 * titles come only from the resolved definition, never from type-name similarity.
 */
export function contentDataToLegacyInput(contentData, definition) {
  const validation = validateContentData(contentData, definition)
  if (!validation.ok) {
    const error = new Error(`contentData inválido: ${validation.errors.join(' ')}`)
    error.code = 'INVALID_CONTENT_DATA'
    error.errors = validation.errors
    throw error
  }

  if (!definition?.id || typeof definition.id !== 'string') {
    const error = new Error('La definición necesita un identificador técnico.')
    error.code = 'INVALID_CONTENT_TYPE_DEFINITION'
    throw error
  }

  const data = validation.data
  const legacy = { contentType: definition.id }
  for (const [contentKey, legacyKey] of Object.entries(DIRECT_LEGACY_KEYS)) {
    if (contentKey === 'sponsor') {
      assignIfPresent(legacy, legacyKey, data[contentKey] ? { ...data[contentKey] } : undefined)
    } else if (['known_facts', 'hashtags', 'links'].includes(contentKey)) {
      assignIfPresent(legacy, legacyKey, data[contentKey] ? [...data[contentKey]] : undefined)
    } else {
      assignIfPresent(legacy, legacyKey, data[contentKey])
    }
  }

  const fields = selectedFields(definition)
  const usesEventTemplate = definition?.visual?.template === 'event'
  const requiresEventContract = fields.some(
    ({ key, required }) => required === true && EVENT_FIELD_KEYS.includes(key)
  )
  if (usesEventTemplate || requiresEventContract) {
    const title = resolveContentTitle(data, definition)
    const eventDetails = {}
    assignIfPresent(eventDetails, 'name', title)
    assignIfPresent(eventDetails, 'date', data.date)
    assignIfPresent(eventDetails, 'time', data.time)
    assignIfPresent(eventDetails, 'location', data.location)
    if (usesEventTemplate || Object.keys(eventDetails).length) legacy.eventDetails = eventDetails

    if (!legacy.topic && title) {
      const logistics = [data.date, data.time, data.location].filter(Boolean).join(' · ')
      legacy.topic = logistics ? `${title} — ${logistics}` : title
    }
    if (!legacy.intent && title) {
      legacy.intent = data.location
        ? `Invitar al público a ${title} en ${data.location}`
        : `Invitar al público a ${title}`
    }
  }

  return legacy
}
