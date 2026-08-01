import { listBackgroundOptions } from '@/lib/social-template/backgroundCatalog'
import { DEFAULT_GENERATION_CONTENT_TYPE, isEventContentType } from '@/lib/ai-constants'
import {
  buildEventDetails,
  deriveEventTopicAndIntent,
  formatEventDateLabel,
  formatEventTimeLabel,
  validateSponsorLogo,
} from '@/lib/social-template/eventFormHelpers'
import { resolveTemplateLayoutId } from '@/lib/social-template/templateLayouts'

const BACKGROUND_OPTIONS = listBackgroundOptions()

/**
 * Default state for the event-first generation form.
 */
export const DEFAULT_GENERATION_FORM = {
  intent: '',
  topic: '',
  platforms: ['x', 'instagram', 'facebook'],
  contentType: DEFAULT_GENERATION_CONTENT_TYPE,
  tone: '',
  audience: '',
  cta: '',
  knownFacts: '',
  hashtags: '',
  links: '',
  imageStyle: '',
  imageConstraints: '',
  eventName: '',
  eventDate: '',
  eventTime: '',
  eventLocation: '',
  eventCta: '',
  /** Default: stock template path */
  backgroundMode: 'stock',
  backgroundId: BACKGROUND_OPTIONS[0]?.id || 'telescope-nebula',
  /** Optional sponsor logo: { dataUrl, mimeType, fileName } | null */
  sponsorLogo: null,
}

function splitList(value, separator = ',') {
  if (!value || !String(value).trim()) return undefined
  const list = String(value)
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? list : undefined
}

/**
 * Build the JSON body for POST /api/admin/ai/generate.
 * For event-oriented content, derives topic/intent from event logistics.
 * @param {object} formState
 */
export function buildGenerationPayload(formState) {
  const isEvent = isEventContentType(formState.contentType)
  const derived = isEvent ? deriveEventTopicAndIntent(formState) : null
  const hasTemplate = Boolean(resolveTemplateLayoutId(formState.contentType))

  const backgroundMode = hasTemplate
    ? isEvent
      ? formState.backgroundMode === 'ai_generated'
        ? 'ai_generated'
        : 'stock'
      : formState.backgroundMode === 'stock' || formState.backgroundMode === 'ai_generated'
        ? formState.backgroundMode
        : undefined
    : undefined

  const payload = {
    intent: isEvent ? derived.intent : formState.intent.trim(),
    topic: isEvent ? derived.topic : formState.topic.trim(),
    platforms: formState.platforms,
    contentType: formState.contentType,
    tone: formState.tone?.trim() || undefined,
    audience: formState.audience?.trim() || undefined,
    cta: isEvent ? formState.eventCta?.trim() || undefined : formState.cta?.trim() || undefined,
    knownFacts: splitList(formState.knownFacts, '\n'),
    hashtags: splitList(formState.hashtags),
    links: splitList(formState.links),
    eventDetails: buildEventDetails(formState),
    imageStyle: formState.imageStyle?.trim() || undefined,
    imageConstraints: formState.imageConstraints?.trim() || undefined,
    backgroundMode,
    backgroundId:
      backgroundMode === 'stock' && formState.backgroundId ? formState.backgroundId : undefined,
  }

  if (isEvent && formState.sponsorLogo?.dataUrl) {
    const check = validateSponsorLogo(formState.sponsorLogo)
    if (check.ok) {
      payload.sponsorLogo = {
        dataUrl: formState.sponsorLogo.dataUrl,
        mimeType: formState.sponsorLogo.mimeType,
        fileName: formState.sponsorLogo.fileName || undefined,
      }
    }
  }

  return payload
}

export { formatEventDateLabel, formatEventTimeLabel }
