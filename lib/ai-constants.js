/**
 * Default seed platforms for the first Guidelines document in S3 (SAC's current footprint).
 * Not a runtime allowlist — active platforms come from the Guidelines document.
 */
export const DEFAULT_SEED_PLATFORMS = ['x', 'instagram', 'facebook']

export const DEFAULT_SEED_PLATFORM_LABELS = {
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

/** Upper bound on platforms in a Guidelines document / generation request. */
export const MAX_GUIDELINE_PLATFORMS = 10

/** Platform id slug pattern (derived from a display name). */
export const PLATFORM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const OBSERVATION_NIGHT_CONTENT_TYPE = 'observation_night'
export const OBSERVATION_NIGHT_LABEL = 'Noche de Observación'

/** Canonical content-type definitions and generator order. */
export const CONTENT_TYPE_DEFINITIONS = [
  {
    id: OBSERVATION_NIGHT_CONTENT_TYPE,
    label: OBSERVATION_NIGHT_LABEL,
    event: { canonicalName: OBSERVATION_NIGHT_LABEL, requiresCta: false },
  },
  { id: 'regular_post', label: 'Publicación regular' },
  { id: 'caption', label: 'Caption' },
  { id: 'image_post', label: 'Publicación con imagen' },
  { id: 'carousel', label: 'Carrusel' },
  { id: 'reel_caption', label: 'Caption de reel' },
  {
    id: 'event_promotion',
    label: 'Promoción de evento',
    event: { canonicalName: null, requiresCta: true },
  },
  { id: 'educational_astronomy', label: 'Educación astronómica' },
  { id: 'member_update', label: 'Actualización para miembros' },
]

/** Content types supported by the AI workspace. */
export const CONTENT_TYPES = CONTENT_TYPE_DEFINITIONS.map(({ id }) => id)
export const DEFAULT_GENERATION_CONTENT_TYPE = CONTENT_TYPES[0]

export const CONTENT_TYPE_LABELS = Object.fromEntries(
  CONTENT_TYPE_DEFINITIONS.map(({ id, label }) => [id, label])
)

export const EVENT_CONTENT_TYPES = CONTENT_TYPE_DEFINITIONS.filter(({ event }) => event).map(
  ({ id }) => id
)

export function getContentTypeDefinition(contentType) {
  return CONTENT_TYPE_DEFINITIONS.find(({ id }) => id === contentType)
}

function definitionField(definition, key) {
  return Array.isArray(definition?.fields)
    ? definition.fields.find((field) => field?.key === key)
    : null
}

export function isEventContentType(contentType, definition) {
  if (definition) {
    return (
      definition.visual?.template === 'event' ||
      ['event_name', 'date', 'time', 'location'].some(
        (key) => definitionField(definition, key)?.required === true
      )
    )
  }
  return EVENT_CONTENT_TYPES.includes(contentType)
}

export function getCanonicalEventName(contentType, definition) {
  if (definition) {
    return definition.titleSource === 'type_label' ? definition.label || null : null
  }
  return getContentTypeDefinition(contentType)?.event?.canonicalName || null
}

export function contentTypeRequiresEventCta(contentType, definition) {
  if (definition) return definitionField(definition, 'cta')?.required === true
  return getContentTypeDefinition(contentType)?.event?.requiresCta === true
}

/** Bounds shared by the generation API and workflow schema. */
export const GENERATION_INPUT_LIMITS = {
  intent: 500,
  topic: 600,
  tone: 120,
  audience: 200,
  cta: 300,
  listItems: 20,
  listItem: 500,
  eventName: 160,
  eventDate: 40,
  eventTime: 40,
  eventLocation: 240,
  imageStyle: 500,
  imageConstraints: 1000,
  sponsorFileName: 255,
}

/** Content types that are intrinsically visual (accept images on any platform). */
export const IMAGE_CONTENT_TYPES = ['image_post', 'carousel']

/**
 * Content types that are especially image-oriented (docs / UI hints).
 * Generation defaults to producing an image for every type except reel captions.
 */
export const IMAGE_PROMPT_CONTENT_TYPES = [
  'image_post',
  'carousel',
  OBSERVATION_NIGHT_CONTENT_TYPE,
  'event_promotion',
  'educational_astronomy',
]

/**
 * Whether the generation workflow should produce imagePrompt/imageRationale
 * and attempt image assets. Default is yes for all content types except
 * reel captions (text-only) and stock template backgrounds, which already provide
 * the visual asset. Optional imageStyle/imageConstraints refine generated visuals.
 * @param {string} contentType
 * @param {{ imageStyle?: string, imageConstraints?: string }} [input]
 * @returns {boolean}
 */
export function shouldGenerateImagePrompt(contentType, input = {}, definition) {
  const resolvedDefinition = definition || input?.contentTypeDefinition
  if (resolvedDefinition) {
    const platforms = Array.isArray(input?.platforms) ? input.platforms : []
    if (
      platforms.length > 0 &&
      platforms.every(
        (platform) => resolvedDefinition.visual?.imagePolicyByPlatform?.[platform] === 'prohibited'
      )
    ) {
      return false
    }
    return resolvedDefinition.visual?.mode !== 'none'
  }
  if (contentType === 'reel_caption') return false
  if (input.backgroundMode === 'stock') return false
  return true
}

/**
 * Legacy media-posture hints for seed platforms when no content-type definition is present.
 * Unknown platforms default to `mixed`. Prefer `imagePolicyByPlatform` on the catalog entry.
 * - text_first: no image upload for regular_post
 * - image_first: regular_post requires at least one image
 * - mixed: regular_post accepts images but does not require them
 */
export const PLATFORM_MEDIA_POSTURE = {
  x: 'text_first',
  instagram: 'image_first',
  facebook: 'mixed',
}

/**
 * Whether the validation form should show/accept image uploads.
 * @param {string} platform
 * @param {string} contentType
 * @returns {boolean}
 */
export function contentTypeAcceptsImages(platform, contentType, definition) {
  if (definition) {
    const policy = definition.visual?.imagePolicyByPlatform?.[String(platform || '').toLowerCase()]
    return policy === 'optional' || policy === 'required'
  }
  if (contentType === OBSERVATION_NIGHT_CONTENT_TYPE) return true
  if (IMAGE_CONTENT_TYPES.includes(contentType)) return true
  if (contentType !== 'regular_post') return false
  const posture = PLATFORM_MEDIA_POSTURE[String(platform || '').toLowerCase()] || 'mixed'
  return posture === 'image_first' || posture === 'mixed'
}

/**
 * Whether at least one image is required for this platform + content type.
 * @param {string} platform
 * @param {string} contentType
 * @returns {boolean}
 */
export function contentTypeRequiresImages(platform, contentType, definition) {
  if (definition) {
    return (
      definition.visual?.imagePolicyByPlatform?.[String(platform || '').toLowerCase()] ===
      'required'
    )
  }
  if (IMAGE_CONTENT_TYPES.includes(contentType)) return false
  if (contentType !== 'regular_post') return false
  const posture = PLATFORM_MEDIA_POSTURE[String(platform || '').toLowerCase()] || 'mixed'
  return posture === 'image_first'
}

export const MAX_VALIDATION_IMAGES = 4
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const OUTCOME_LABELS = {
  pass: 'Sin problemas detectados',
  warning: 'Requiere atención',
  fail: 'No cumple',
}

export const APPROVAL_LABELS = {
  ready_for_review: 'Pendiente de revisión humana',
  needs_edits: 'Necesita ediciones',
  do_not_publish: 'No publicar',
}

export const SEVERITY_LABELS = {
  critical: 'Crítico',
  major: 'Mayor',
  minor: 'Menor',
  suggestion: 'Sugerencia',
}

export const CATEGORY_LABELS = {
  brand_voice: 'Voz de marca',
  guideline_compliance: 'Cumplimiento de guías',
  platform_fit: 'Ajuste a plataforma',
  clarity: 'Claridad',
  completeness: 'Completitud',
  uncertainty_factual_risk: 'Riesgo factual / incertidumbre',
  accessibility: 'Accesibilidad',
  safety: 'Seguridad',
  formatting: 'Formato',
  privacy: 'Privacidad',
  image_text_alignment: 'Alineación imagen-texto',
  image_suitability: 'Idoneidad de imagen',
}
