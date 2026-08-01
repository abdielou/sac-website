import {
  EVENT_WEATHER_DISCLAIMER,
  formatEventDateLabel,
  formatEventTimeLabel,
} from './eventFormHelpers'
import { getCanonicalEventName } from '../ai-constants'
import { getTemplateLayout, resolveTemplateLayoutId } from './templateLayouts'

function trimOrUndefined(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

/**
 * Deterministic text fields for template overlays from generation input.
 * Headline: eventDetails.name for event-oriented content, else topic.
 * Subtitle (event only): AI-generated posterSubtitle, or a public-facing fallback.
 * Body (event only): AI-generated posterBody.
 * Pills (event only): date / time / location when provided.
 * Weather disclaimer always present on event layout.
 *
 * @param {{ input: object, contentType?: string, posterText?: { subtitle?: string, body?: string } }} params
 * @returns {{ layout: string, headline: string, subtitle?: string, body?: string, dateLabel?: string, timeLabel?: string, locationLabel?: string, weatherDisclaimer?: string } | null}
 */
export function buildTemplateTextFields({ input, contentType, posterText } = {}) {
  const type = contentType || input?.contentType
  const layoutId = resolveTemplateLayoutId(type)
  if (!layoutId || !getTemplateLayout(layoutId)) return null

  const eventName = getCanonicalEventName(type) || trimOrUndefined(input?.eventDetails?.name)
  const topic = trimOrUndefined(input?.topic)
  const headline = eventName || topic || 'Sociedad de Astronomía del Caribe'

  const fields = {
    layout: layoutId,
    headline,
  }

  if (layoutId === 'event') {
    const locationLabel = trimOrUndefined(input?.eventDetails?.location)
    const subtitle =
      trimOrUndefined(posterText?.subtitle) ||
      (locationLabel
        ? `Acompáñanos bajo las estrellas en ${locationLabel}.`
        : 'Acompáñanos bajo las estrellas.')
    if (subtitle) fields.subtitle = subtitle

    const body = trimOrUndefined(posterText?.body)
    if (body) fields.body = body

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
      ...(sponsorLogo ? { sponsorLogo } : null),
    },
  }
}
