import {
  EVENT_WEATHER_DISCLAIMER,
  formatEventDateLabel,
  formatEventTimeLabel,
} from './eventFormHelpers'
import { getCanonicalEventName } from '../ai-constants'
import { buildAiImageDownloadFileName } from '../ai-image-download-name'
import { resolveImageTextPolicy } from '../ai-image-text-policy'
import {
  getTemplateLayout,
  normalizeEventTemplatePresentation,
  resolveTemplateLayoutId,
} from './templateLayouts'

export const EVENT_POSTER_SUBTITLE_FALLBACK = 'Acompáñanos a descubrir el cielo.'
export const EVENT_POSTER_BODY_FALLBACK =
  'Una noche para observar, aprender y compartir bajo las estrellas.'

const EVENT_POSTER_SUBTITLE_MAX_LENGTH = 80
const EVENT_POSTER_BODY_MAX_LENGTH = 140

function trimOrUndefined(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeForComparison(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function includesFixedPosterDetail(text, input, headline) {
  const normalizedText = normalizeForComparison(text)
  if (!normalizedText) return false

  const titleCandidates = [headline, input?.eventDetails?.name]
    .map(normalizeForComparison)
    .filter((value) => value.split(' ').length > 1)
  const logisticsCandidates = [
    input?.eventDetails?.date,
    formatEventDateLabel(input?.eventDetails?.date),
    input?.eventDetails?.time,
    formatEventTimeLabel(input?.eventDetails?.time),
    input?.eventDetails?.location,
  ]
    .map(normalizeForComparison)
    .filter((value) => value.length >= 2)

  const paddedText = ` ${normalizedText} `
  if (
    [...titleCandidates, ...logisticsCandidates].some((value) => paddedText.includes(` ${value} `))
  ) {
    return true
  }

  const hasDate =
    /\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(
      normalizedText
    ) || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalizedText)
  const hasTime =
    /\b\d{1,2}:\d{2}\b/.test(normalizedText) ||
    /\b\d{1,2}\s*(?:a\s*m|p\s*m|am|pm)\b/.test(normalizedText)

  return hasDate || hasTime
}

function resolvePosterField(value, { fallback, maxLength, input, headline }) {
  const text = trimOrUndefined(value)
  if (!text || includesFixedPosterDetail(text, input, headline)) return fallback
  return text.slice(0, maxLength).trim()
}

/**
 * Deterministic text fields for template overlays from generation input.
 * Headline: eventDetails.name for event-oriented content, else topic.
 * Subtitle (event only): AI-generated posterSubtitle, or a public-facing fallback.
 * Body (event only): AI-generated posterBody, or a public-facing fallback.
 * Pills (event only): date / time / location when provided.
 * Weather disclaimer always present on event layout.
 *
 * @param {{ input: object, contentType?: string, contentTypeDefinition?: object, posterText?: { subtitle?: string, body?: string } }} params
 * @returns {{ layout: string, headline: string, subtitle?: string, body?: string, dateLabel?: string, timeLabel?: string, locationLabel?: string, weatherDisclaimer?: string } | null}
 */
export function buildTemplateTextFields({
  input,
  contentType,
  contentTypeDefinition,
  posterText,
} = {}) {
  const type = contentType || input?.contentType
  const definition = contentTypeDefinition || input?.contentTypeDefinition
  const layoutId = resolveTemplateLayoutId(type, definition)
  const templatePresentation =
    layoutId === 'event'
      ? normalizeEventTemplatePresentation(input?.templatePresentation)
      : undefined
  if (!layoutId || !getTemplateLayout(layoutId, undefined, templatePresentation)) return null

  const eventName =
    getCanonicalEventName(type, definition) || trimOrUndefined(input?.eventDetails?.name)
  const topic = trimOrUndefined(input?.topic)
  const imageTextPolicy = resolveImageTextPolicy(input, definition?.generation?.rules)
  const headline =
    eventName || imageTextPolicy.suggestedText || topic || 'Sociedad de Astronomía del Caribe'

  const fields = {
    layout: layoutId,
    headline,
  }

  if (layoutId === 'event') {
    const locationLabel = trimOrUndefined(input?.eventDetails?.location)
    fields.subtitle = resolvePosterField(posterText?.subtitle, {
      fallback: EVENT_POSTER_SUBTITLE_FALLBACK,
      maxLength: EVENT_POSTER_SUBTITLE_MAX_LENGTH,
      input,
      headline,
    })
    fields.body = resolvePosterField(posterText?.body, {
      fallback: EVENT_POSTER_BODY_FALLBACK,
      maxLength: EVENT_POSTER_BODY_MAX_LENGTH,
      input,
      headline,
    })

    const rawDate = trimOrUndefined(input?.eventDetails?.date)
    const rawTime = trimOrUndefined(input?.eventDetails?.time)
    const dateLabel = formatEventDateLabel(rawDate)
    const timeLabel = formatEventTimeLabel(rawTime)
    if (dateLabel) fields.dateLabel = dateLabel
    if (timeLabel) fields.timeLabel = timeLabel
    if (locationLabel) fields.locationLabel = locationLabel
    fields.weatherDisclaimer = EVENT_WEATHER_DISCLAIMER
  }

  return fields
}

/**
 * Attach one shared template request and one shared asset bundle.
 * Pure — no I/O. backdropDataUrl is used when mode is ai_generated.
 *
 * @param {object} result - AiGenerationResult
 * @param {object} input - validated GenerateInput
 * @param {{ backdropDataUrl?: string, posterText?: { subtitle?: string, body?: string } }} [options]
 * @returns {object}
 */
export function attachTemplateRequestsToResult(result, input, options = {}) {
  const mode = input?.backgroundMode
  if (mode !== 'stock' && mode !== 'ai_generated') {
    return result
  }

  const textFields = buildTemplateTextFields({
    input,
    contentType: input.contentType,
    contentTypeDefinition: input.contentTypeDefinition,
    posterText: options.posterText,
  })
  if (!textFields) {
    return result
  }

  const backgroundSource =
    mode === 'stock'
      ? { mode: 'stock', backgroundId: input.backgroundId }
      : { mode: 'ai_generated', dataUrl: options.backdropDataUrl }

  const sponsorLogo = input?.sponsorLogo?.dataUrl
    ? {
        dataUrl: input.sponsorLogo.dataUrl,
        mimeType: input.sponsorLogo.mimeType,
        fileName: input.sponsorLogo.fileName,
      }
    : undefined

  const templateRequest = {
    layout: textFields.layout,
    ...(textFields.layout === 'event'
      ? { templatePresentation: normalizeEventTemplatePresentation(input?.templatePresentation) }
      : null),
    textFields: {
      headline: textFields.headline,
      ...(textFields.subtitle ? { subtitle: textFields.subtitle } : null),
      ...(textFields.body ? { body: textFields.body } : null),
      ...(textFields.dateLabel ? { dateLabel: textFields.dateLabel } : null),
      ...(textFields.timeLabel ? { timeLabel: textFields.timeLabel } : null),
      ...(textFields.locationLabel ? { locationLabel: textFields.locationLabel } : null),
      ...(textFields.weatherDisclaimer
        ? { weatherDisclaimer: textFields.weatherDisclaimer }
        : null),
    },
  }

  return {
    ...result,
    templateRequest,
    templateAssets: {
      backgroundSource,
      downloadFileName: buildAiImageDownloadFileName({
        contentType: input.contentType,
        eventDetails: input.eventDetails,
        topic: input.topic,
        mimeType: 'image/jpeg',
      }),
      ...(sponsorLogo ? { sponsorLogo } : null),
    },
  }
}
