import { CONTENT_TYPE_LABELS, PLATFORM_LABELS } from './ai-constants'

const DEFAULT_VERSION = 'mvp-default-v1'

const GLOBAL_GUIDELINES = `Idioma: Español (prioridad). Puerto Rico first.
Seguridad: no afirmar aprobaciones oficiales de SAC. No inventar fechas/horarios/lugares.
Astronomía: no verificar hechos; si hay riesgo de afirmaciones no verificables, marcar uncertainty_factual_risk.
Human-in-the-loop: humanReviewRequired siempre true. AI es asesoría.`

const PLATFORM_GUIDELINES = {
  x: 'X: considerar límites de caracteres; hashtags/CTA deben ser consistentes.',
  instagram: 'Instagram: priorizar claridad del caption; validar alineación texto-imagen.',
  facebook: 'Facebook: revisar completitud de evento (nombre/fecha/hora/lugar/CTA) si aplica.',
}

const PLATFORM_LABELS_SEED = {
  x: PLATFORM_LABELS.x,
  instagram: PLATFORM_LABELS.instagram,
  facebook: PLATFORM_LABELS.facebook,
}

const PROHIBITED_CONTENT = `No publicidad comercial no autorizada.
No comentario político partidista.
No afirmaciones pseudocientíficas presentadas como hechos verificados.
No imágenes generadas por IA que parezcan fotos documentales reales sin etiqueta clara.`

const IMAGE_VALIDATION = `Verificar accesibilidad (texto alternativo cuando aplique).
Resolución mínima recomendada: 1080p para publicaciones con imagen.
Precisión astronómica razonable: mapas estelares coherentes, iluminación realista.
Validar alineación entre texto e imagen.`

const CONTENT_TYPE_RULES = {
  event_promotion:
    'Requiere nombre, fecha, hora, lugar y CTA del evento. Marcar completeness si faltan.',
  educational_astronomy:
    'No verificar hechos astronómicos; marcar uncertainty_factual_risk ante afirmaciones no verificables.',
  member_update: 'No incluir datos privados de miembros.',
  image_post: 'Validar alineación texto-imagen y idoneidad visual.',
  carousel: 'Validar cada imagen y alineación con el caption.',
  reel_caption: 'Solo texto; no se valida video.',
}

function buildGuidelinesSnapshot() {
  return {
    version: DEFAULT_VERSION,
    global: GLOBAL_GUIDELINES,
    platforms: { ...PLATFORM_GUIDELINES },
    platformLabels: { ...PLATFORM_LABELS_SEED },
    prohibited: PROHIBITED_CONTENT,
    imageValidation: IMAGE_VALIDATION,
    contentTypes: { ...CONTENT_TYPE_RULES },
  }
}

/**
 * Default guidelines seed (server stub and client localStorage initializer).
 */
export function getDefaultGuidelines() {
  return buildGuidelinesSnapshot()
}

/**
 * Active guidelines stub for Phases 1–2. Phase 3 replaces with S3-backed guidelines-store.
 */
export function getActiveGuidelines() {
  return getDefaultGuidelines()
}

/**
 * Resolve platform + content-type rules for a validation/generation request.
 */
export function resolveGuidelinesForRequest({ platform, contentType }) {
  const active = getActiveGuidelines()
  const platformKey = String(platform || '').toLowerCase()
  const platformRules = active.platforms[platformKey] || 'Reglas generales de plataforma.'
  const contentTypeLabel = CONTENT_TYPE_LABELS[contentType] || contentType
  const contentTypeRules =
    active.contentTypes[contentType] ||
    `Tipo de contenido: ${contentTypeLabel}. Aplica reglas mínimas de completitud según el tipo.`

  return {
    version: active.version,
    global: active.global,
    platform: platformRules,
    contentType: contentTypeRules,
    prohibited: active.prohibited,
    imageValidation: active.imageValidation,
  }
}
