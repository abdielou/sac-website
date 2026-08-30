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

function definitionField(definition, key) {
  return Array.isArray(definition?.fields)
    ? definition.fields.find((field) => field?.key === key)
    : null
}

export function isEventContentType(_contentType, definition) {
  return Boolean(
    definition &&
    (definition.visual?.template === 'event' ||
      ['event_name', 'date', 'time', 'location'].some(
        (key) => definitionField(definition, key)?.required === true
      ))
  )
}

export function getCanonicalEventName(_contentType, definition) {
  return definition?.titleSource === 'type_label' ? definition.label || null : null
}

export function contentTypeRequiresEventCta(_contentType, definition) {
  return definitionField(definition, 'cta')?.required === true
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

/**
 * Whether the generation workflow should produce imagePrompt/imageRationale
 * and attempt image assets, as defined by the pinned Guidelines entry.
 * @param {string} contentType
 * @param {{ imageStyle?: string, imageConstraints?: string }} [input]
 * @returns {boolean}
 */
export function shouldGenerateImagePrompt(contentType, input = {}, definition) {
  const resolvedDefinition = definition || input?.contentTypeDefinition
  if (!resolvedDefinition) return false
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

/**
 * Whether the validation form should show/accept image uploads.
 * @param {string} platform
 * @param {string} contentType
 * @returns {boolean}
 */
export function contentTypeAcceptsImages(platform, contentType, definition) {
  const policy = definition?.visual?.imagePolicyByPlatform?.[String(platform || '').toLowerCase()]
  return policy === 'optional' || policy === 'required'
}

/**
 * Whether at least one image is required for this platform + content type.
 * @param {string} platform
 * @param {string} contentType
 * @returns {boolean}
 */
export function contentTypeRequiresImages(platform, contentType, definition) {
  return (
    definition?.visual?.imagePolicyByPlatform?.[String(platform || '').toLowerCase()] === 'required'
  )
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
