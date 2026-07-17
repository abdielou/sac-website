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

// ---------- Generation-oriented guidelines (Phase 2C) ----------

const GENERATION_GLOBAL_GUIDELINES = `Idioma: Español (por defecto). Voz de SAC: cercana, educativa, Puerto Rico first.
Preservación de hechos: usa los datos provistos (knownFacts, eventDetails, enlaces) tal cual, sin alterarlos ni reinterpretarlos.
NO inventes fechas, horarios, lugares, costos, enlaces ni hechos científicos no provistos; deja el faltante en missingInformation.
NO afirmes aprobación oficial de SAC ni que el contenido está listo para publicar sin revisión humana.
Siempre llena "assumptions" (supuestos tomados) y "missingInformation" (datos que faltan); usa [] si no aplica.
Human-in-the-loop: humanReviewRequired siempre true. El borrador es una propuesta para revisión.`

const GENERATION_PLATFORM_GUIDELINES = {
  x: 'X: redacción concisa, máximo 280 caracteres por borrador; 1-2 hashtags relevantes; CTA breve si aplica.',
  instagram:
    'Instagram: caption con gancho en la primera línea, tono visual y cercano; hashtags moderados (3-5) al final; CTA clara si aplica.',
  facebook:
    'Facebook: redacción más completa; para eventos incluir toda la información provista (nombre/fecha/hora/lugar) y CTA explícita; tono comunitario.',
}

const GENERATION_CONTENT_TYPE_RULES = {
  event_promotion:
    'Promoción de evento: usa únicamente los datos de evento provistos (nombre, fecha, hora, lugar, registro); lista en missingInformation cualquier dato faltante en vez de inventarlo.',
  educational_astronomy:
    'Educación astronómica: cautela factual; presenta solo afirmaciones respaldadas por la información provista y marca supuestos en assumptions.',
  member_update:
    'Actualización para miembros: no incluir datos privados de miembros (nombres completos, contacto, pagos).',
  image_post:
    'Publicación con imagen: el texto debe funcionar como caption; no describas una imagen inexistente como si fuera real.',
  carousel:
    'Carrusel: el caption debe presentar el tema general; no inventes el contenido de cada lámina.',
  reel_caption: 'Caption de reel: solo texto; no prometas contenido de video no provisto.',
  regular_post: 'Publicación regular: mensaje claro y autocontenido, fiel a los datos provistos.',
  caption: 'Caption: texto breve de acompañamiento, fiel a los datos provistos.',
}

const GENERATION_IMAGE_PROMPT_GUIDELINES = `Prompts de imagen (borrador para generación futura — no generar assets en esta fase):
- Describir escena/tema visual alineado al borrador de texto y al tema, sin inventar hechos no provistos.
- NO incluir personas identificables, menores, datos privados, logos oficiales ni estilos con copyright.
- NO mostrar fechas, horarios, lugares, costos ni enlaces específicos que no estén en los datos provistos.
- NO implicar aprobación oficial de SAC ni fotos documentales reales sin etiqueta.
- Incluir restricciones de seguridad explícitas (sin rostros identificables, sin texto superpuesto, sin logo SAC).
- "imageRationale" debe explicar por qué el prompt apoya el mensaje sin añadir hechos inventados.
- Respetar imageStyle e imageConstraints del usuario cuando estén provistos.`

function buildGuidelinesSnapshot() {
  return {
    version: DEFAULT_VERSION,
    global: GLOBAL_GUIDELINES,
    platforms: { ...PLATFORM_GUIDELINES },
    platformLabels: { ...PLATFORM_LABELS_SEED },
    prohibited: PROHIBITED_CONTENT,
    imageValidation: IMAGE_VALIDATION,
    contentTypes: { ...CONTENT_TYPE_RULES },
    generation: {
      global: GENERATION_GLOBAL_GUIDELINES,
      platforms: { ...GENERATION_PLATFORM_GUIDELINES },
      contentTypes: { ...GENERATION_CONTENT_TYPE_RULES },
      imagePrompt: GENERATION_IMAGE_PROMPT_GUIDELINES,
    },
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

/**
 * Resolve generation-oriented (drafting) rules for a generation request.
 * Same fallback pattern as `resolveGuidelinesForRequest`, but reads the
 * `generation` section of the active guidelines (Phase 2C).
 */
export function resolveGenerationGuidelinesForRequest({ platform, contentType }) {
  const active = getActiveGuidelines()
  const generation = active.generation || { global: active.global, platforms: {}, contentTypes: {} }
  const platformKey = String(platform || '').toLowerCase()
  const platformRules =
    generation.platforms[platformKey] || 'Reglas generales de redacción para la plataforma.'
  const contentTypeLabel = CONTENT_TYPE_LABELS[contentType] || contentType
  const contentTypeRules =
    generation.contentTypes[contentType] ||
    `Tipo de contenido: ${contentTypeLabel}. Redactar fiel a los datos provistos, sin inventar detalles.`

  return {
    version: active.version,
    global: generation.global,
    platform: platformRules,
    contentType: contentTypeRules,
    prohibited: active.prohibited,
    imagePrompt: generation.imagePrompt || GENERATION_IMAGE_PROMPT_GUIDELINES,
    imageValidation: active.imageValidation,
  }
}
