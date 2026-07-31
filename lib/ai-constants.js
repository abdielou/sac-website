/** Platforms supported by the AI Social Media Designer (PRD §77). */
export const PLATFORMS = ['x', 'instagram', 'facebook']

export const PLATFORM_LABELS = {
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

export const OBSERVATION_NIGHT_CONTENT_TYPE = 'observation_night'
export const OBSERVATION_NIGHT_LABEL = 'Noche de Observación'

/** Content types supported by the AI workspace. */
export const CONTENT_TYPES = [
  'regular_post',
  'caption',
  'image_post',
  'carousel',
  'reel_caption',
  OBSERVATION_NIGHT_CONTENT_TYPE,
  'event_promotion',
  'educational_astronomy',
  'member_update',
]

export const CONTENT_TYPE_LABELS = {
  regular_post: 'Publicación regular',
  caption: 'Caption',
  image_post: 'Publicación con imagen',
  carousel: 'Carrusel',
  reel_caption: 'Caption de reel',
  [OBSERVATION_NIGHT_CONTENT_TYPE]: OBSERVATION_NIGHT_LABEL,
  event_promotion: 'Promoción de evento',
  educational_astronomy: 'Educación astronómica',
  member_update: 'Actualización para miembros',
}

export const EVENT_CONTENT_TYPES = [OBSERVATION_NIGHT_CONTENT_TYPE, 'event_promotion']

export function isEventContentType(contentType) {
  return EVENT_CONTENT_TYPES.includes(contentType)
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
 * Whether the generation workflow should produce imagePrompt/imageRationale (Phase 2D)
 * and attempt image assets (Phase 2E). Default is yes for all content types except
 * reel captions (text-only). Optional imageStyle/imageConstraints refine the prompt.
 * @param {string} contentType
 * @param {{ imageStyle?: string, imageConstraints?: string }} [input]
 * @returns {boolean}
 */
export function shouldGenerateImagePrompt(contentType, _input = {}) {
  if (contentType === 'reel_caption') return false
  return true
}

/**
 * How each platform treats media on non-image-specific content types (e.g. regular_post).
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
export function contentTypeAcceptsImages(platform, contentType) {
  if (contentType === OBSERVATION_NIGHT_CONTENT_TYPE) return true
  if (IMAGE_CONTENT_TYPES.includes(contentType)) return true
  if (contentType !== 'regular_post') return false
  const posture = PLATFORM_MEDIA_POSTURE[String(platform || '').toLowerCase()]
  return posture === 'image_first' || posture === 'mixed'
}

/**
 * Whether at least one image is required for this platform + content type.
 * @param {string} platform
 * @param {string} contentType
 * @returns {boolean}
 */
export function contentTypeRequiresImages(platform, contentType) {
  if (IMAGE_CONTENT_TYPES.includes(contentType)) return false
  if (contentType !== 'regular_post') return false
  const posture = PLATFORM_MEDIA_POSTURE[String(platform || '').toLowerCase()]
  return posture === 'image_first'
}

export const MAX_VALIDATION_IMAGES = 4
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const OUTCOME_LABELS = {
  pass: 'Aprobado',
  warning: 'Advertencia',
  fail: 'No cumple',
}

export const APPROVAL_LABELS = {
  ready_for_review: 'Listo para revisión',
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
