import { listBackgroundOptions } from '@/lib/social-template/backgroundCatalog'
import {
  DEFAULT_SEED_PLATFORMS,
  isEventContentType,
  shouldGenerateImagePrompt,
} from '@/lib/ai-constants'
import {
  buildEventDetails,
  deriveEventTopicAndIntent,
  formatEventDateLabel,
  formatEventTimeLabel,
  validateSponsorLogo,
} from '@/lib/social-template/eventFormHelpers'
import {
  DEFAULT_EVENT_TEMPLATE_PRESENTATION,
  normalizeEventTemplatePresentation,
  resolveTemplateLayoutId,
} from '@/lib/social-template/templateLayouts'
import { legacyInputToContentData } from '@/lib/ai-content-data'
import { resolveContentTypePlatforms } from '@/lib/ai-guidelines-schema'

const BACKGROUND_OPTIONS = listBackgroundOptions()

/**
 * Default state for the event-first generation form.
 */
export const DEFAULT_GENERATION_FORM = {
  intent: '',
  topic: '',
  contentType: '',
  generationMode: 'text_and_image',
  publicationText: '',
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
  templatePresentation: DEFAULT_EVENT_TEMPLATE_PRESENTATION,
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
 * @param {object} [contentTypeDefinition]
 * @param {string[]} [platforms] Active guideline platforms; defaults to seed footprint.
 */
export function buildGenerationPayload(formState, contentTypeDefinition, platforms) {
  const configuredPlatforms =
    Array.isArray(platforms) && platforms.length ? platforms : [...DEFAULT_SEED_PLATFORMS]
  const resolvedPlatforms = resolveContentTypePlatforms(contentTypeDefinition, configuredPlatforms)
  const isEvent = isEventContentType(formState.contentType, contentTypeDefinition)
  const derived = isEvent ? deriveEventTopicAndIntent(formState, contentTypeDefinition) : null
  const supportsImageForPlatforms = shouldGenerateImagePrompt(
    formState.contentType,
    { platforms: resolvedPlatforms, contentTypeDefinition },
    contentTypeDefinition
  )
  const generationMode =
    formState.generationMode === 'image_only' && supportsImageForPlatforms
      ? 'image_only'
      : 'text_and_image'
  const templateLayout = resolveTemplateLayoutId(formState.contentType, contentTypeDefinition)
  const hasTemplate =
    Boolean(templateLayout) &&
    shouldGenerateImagePrompt(
      formState.contentType,
      {
        // Omit backgroundMode: stock templates still need hasTemplate=true.
        platforms: resolvedPlatforms,
        contentTypeDefinition,
      },
      contentTypeDefinition
    )
  const allowedBackgroundSources = contentTypeDefinition?.visual?.backgroundSources || []

  const backgroundMode = hasTemplate
    ? contentTypeDefinition
      ? allowedBackgroundSources.includes(formState.backgroundMode)
        ? formState.backgroundMode
        : undefined
      : isEvent
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
    platforms: resolvedPlatforms,
    contentType: formState.contentType,
    generationMode,
    ...(generationMode === 'image_only'
      ? { publicationText: formState.publicationText ?? '' }
      : null),
    tone: formState.tone?.trim() || undefined,
    audience: formState.audience?.trim() || undefined,
    cta: isEvent ? formState.eventCta?.trim() || undefined : formState.cta?.trim() || undefined,
    knownFacts: splitList(formState.knownFacts, '\n'),
    hashtags: splitList(formState.hashtags),
    links: splitList(formState.links),
    eventDetails: buildEventDetails(formState, contentTypeDefinition),
    imageStyle: formState.imageStyle?.trim() || undefined,
    imageConstraints: formState.imageConstraints?.trim() || undefined,
    backgroundMode,
    backgroundId:
      backgroundMode === 'stock' && formState.backgroundId ? formState.backgroundId : undefined,
    templatePresentation:
      hasTemplate && templateLayout === 'event'
        ? normalizeEventTemplatePresentation(formState.templatePresentation)
        : undefined,
  }

  const acceptsSponsor = contentTypeDefinition
    ? Boolean(backgroundMode) &&
      contentTypeDefinition.visual?.sponsorAllowed === true &&
      contentTypeDefinition.fields?.some(({ key }) => key === 'sponsor')
    : isEvent && Boolean(backgroundMode)
  if (acceptsSponsor && formState.sponsorLogo?.dataUrl) {
    const check = validateSponsorLogo(formState.sponsorLogo)
    if (check.ok) {
      payload.sponsorLogo = {
        dataUrl: formState.sponsorLogo.dataUrl,
        mimeType: formState.sponsorLogo.mimeType,
        fileName: formState.sponsorLogo.fileName || undefined,
      }
    }
  }

  if (contentTypeDefinition) {
    payload.contentData = legacyInputToContentData(formState, contentTypeDefinition)
    if (!acceptsSponsor) delete payload.contentData.sponsor
  }

  return payload
}

export { formatEventDateLabel, formatEventTimeLabel }
