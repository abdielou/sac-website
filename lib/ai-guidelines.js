import {
  CONTENT_TYPE_LABELS,
  OBSERVATION_NIGHT_CONTENT_TYPE,
  OBSERVATION_NIGHT_LABEL,
  PLATFORM_LABELS,
} from './ai-constants'
import { AI_AGENT_IDENTITY_PROMPT, AI_AGENT_IDENTITY_VERSION } from './ai-agent'
import {
  GUIDELINES_SCHEMA_VERSION,
  createDefaultContentTypeCatalog,
  normalizeGuidelineDocumentV3,
  resolveContentTypeDefinition,
} from './ai-guidelines-schema'

const DEFAULT_VERSION = 'mvp-default-v1'

const GLOBAL_GUIDELINES = `Idioma: Español (prioridad). Puerto Rico first.
Seguridad: no afirmar aprobaciones oficiales de SAC. No inventar fechas/horarios/lugares.
Astronomía: no verificar hechos; si hay riesgo de afirmaciones no verificables, marcar uncertainty_factual_risk.
Human-in-the-loop: humanReviewRequired siempre true. AI es asesoría.`

const PLATFORM_GUIDELINES = {
  x: 'X: redacción concisa; CTA breve si aplica. No añadir hashtags por defecto.',
  instagram:
    'Instagram: caption claro, visual y cercano, con un gancho en la primera línea y CTA clara si aplica. No añadir hashtags por defecto. Cuando incluya imagen, el texto y la imagen deben estar alineados.',
  facebook:
    'Facebook: redacción completa y de tono comunitario. Para eventos, incluir toda la información provista (nombre, fecha, hora y lugar) y una CTA explícita si aplica. No añadir hashtags por defecto.',
}

const PLATFORM_LABELS_SEED = {
  x: PLATFORM_LABELS.x,
  instagram: PLATFORM_LABELS.instagram,
  facebook: PLATFORM_LABELS.facebook,
}

const PLATFORM_CONSTRAINTS = {
  x: { captionMaxCharacters: 280 },
  instagram: { captionMaxCharacters: null },
  facebook: { captionMaxCharacters: null },
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
  regular_post:
    'Publicación regular: mensaje claro y autocontenido; aplicar reglas mínimas de completitud.',
  caption: 'Caption: texto breve de acompañamiento; validar tono y claridad.',
  [OBSERVATION_NIGHT_CONTENT_TYPE]: `${OBSERVATION_NIGHT_LABEL}: requiere fecha, hora y lugar; el CTA es opcional. Conserva la etiqueta canónica vigente durante cada ejecución; marcar completeness si faltan datos obligatorios.`,
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
Hashtags: no incluir ni sugerir por defecto. Solo usarlos cuando el usuario los solicite, exista una campaña identificable en los datos provistos o las guías activas los requieran explícitamente. SAC no usa hashtags en sus publicaciones habituales.
NO afirmes aprobación oficial de SAC ni que el contenido está listo para publicar sin revisión humana.
Siempre llena "assumptions" (supuestos tomados) y "missingInformation" (datos que faltan); usa [] si no aplica.
Human-in-the-loop: humanReviewRequired siempre true. El borrador es una propuesta para revisión.`

const GENERATION_CONTENT_TYPE_RULES = {
  [OBSERVATION_NIGHT_CONTENT_TYPE]: `${OBSERVATION_NIGHT_LABEL}: conserva la etiqueta canónica vigente durante esta ejecución y usa únicamente la fecha, hora y lugar provistos. El CTA es opcional; si no se provee, no lo marques como información faltante ni lo inventes.`,
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
  const snapshot = {
    schemaVersion: GUIDELINES_SCHEMA_VERSION,
    version: DEFAULT_VERSION,
    global: GLOBAL_GUIDELINES,
    platforms: { ...PLATFORM_GUIDELINES },
    platformLabels: { ...PLATFORM_LABELS_SEED },
    platformConstraints: JSON.parse(JSON.stringify(PLATFORM_CONSTRAINTS)),
    prohibited: PROHIBITED_CONTENT,
    imageValidation: IMAGE_VALIDATION,
    contentTypes: { ...CONTENT_TYPE_RULES },
    generation: {
      global: GENERATION_GLOBAL_GUIDELINES,
      contentTypes: { ...GENERATION_CONTENT_TYPE_RULES },
      imagePrompt: GENERATION_IMAGE_PROMPT_GUIDELINES,
    },
  }
  snapshot.contentTypeCatalog = createDefaultContentTypeCatalog({
    validationRules: snapshot.contentTypes,
    generationRules: snapshot.generation.contentTypes,
  })
  return normalizeGuidelineDocumentV3(snapshot)
}

/**
 * Default guidelines seed (server stub and client localStorage initializer).
 */
export function getDefaultGuidelines() {
  return buildGuidelinesSnapshot()
}

/**
 * Active guidelines from S3-backed guidelines-store (falls back to defaults).
 * Dynamic import avoids a circular dependency with guidelines-store.
 */
export async function getActiveGuidelines() {
  const store = await import('./guidelines-store')
  return store.getActiveGuidelines()
}

/**
 * Runtime variant: a configured store failure must stop a new AI execution
 * instead of silently pinning the built-in seed.
 */
export async function getActiveGuidelinesStrict() {
  const store = await import('./guidelines-store')
  return store.getActiveGuidelinesStrict()
}

/**
 * Resolve platform + content-type rules for a validation/generation request.
 */
export async function resolveGuidelinesForRequest({ platform, contentType }) {
  const active = await getActiveGuidelines()
  return resolveGuidelinesFromDocument(active, { platform, contentType })
}

export function resolveGuidelinesFromDocument(activeDocument, { platform, contentType }) {
  const active = normalizeGuidelineDocumentV3(activeDocument)
  const platformKey = String(platform || '').toLowerCase()
  const platformRules = active.platforms[platformKey] || 'Reglas generales de plataforma.'
  const definition = resolveContentTypeDefinition(active, contentType, { includeArchived: true })
  const contentTypeLabel = definition?.label || CONTENT_TYPE_LABELS[contentType] || contentType
  const contentTypeRules =
    definition?.validation?.rules ||
    active.contentTypes?.[contentType] ||
    `Tipo de contenido: ${contentTypeLabel}. Aplica reglas mínimas de completitud según el tipo.`

  return {
    version: active.version,
    policyVersion: AI_AGENT_IDENTITY_VERSION,
    basePolicy: AI_AGENT_IDENTITY_PROMPT,
    global: active.global,
    platform: platformRules,
    captionMaxCharacters: active.platformConstraints?.[platformKey]?.captionMaxCharacters ?? null,
    contentType: contentTypeRules,
    prohibited: active.prohibited,
    imageValidation: active.imageValidation,
    contentTypeDefinition: definition,
    contentTypeIdentity: definition
      ? { id: definition.id, label: definition.label, guidelineVersion: active.version }
      : null,
  }
}

/**
 * Resolve generation-oriented (drafting) rules for a generation request.
 * Same fallback pattern as `resolveGuidelinesForRequest`, but reads the
 * `generation` section of the active guidelines (Phase 2C).
 */
export async function resolveGenerationGuidelinesForRequest({ platform, contentType }) {
  const active = await getActiveGuidelines()
  return resolveGenerationGuidelinesFromDocument(active, { platform, contentType })
}

/**
 * Resolve generation rules from one immutable snapshot.
 * Workflows use this to keep every platform on the same guidelines version.
 */
export function resolveGenerationGuidelinesFromDocument(active, { platform, contentType }) {
  active = normalizeGuidelineDocumentV3(active)
  const generation = active.generation || { global: active.global, contentTypes: {} }
  const platformKey = String(platform || '').toLowerCase()
  const platformRules = active.platforms[platformKey] || 'Expectativas generales de plataforma.'
  const definition = resolveContentTypeDefinition(active, contentType, { includeArchived: true })
  const contentTypeLabel = definition?.label || CONTENT_TYPE_LABELS[contentType] || contentType
  const contentTypeRules =
    definition?.generation?.rules ||
    generation.contentTypes?.[contentType] ||
    `Tipo de contenido: ${contentTypeLabel}. Redactar fiel a los datos provistos, sin inventar detalles.`

  return {
    version: active.version,
    policyVersion: AI_AGENT_IDENTITY_VERSION,
    basePolicy: AI_AGENT_IDENTITY_PROMPT,
    global: generation.global,
    platform: platformRules,
    captionMaxCharacters: active.platformConstraints?.[platformKey]?.captionMaxCharacters ?? null,
    contentType: contentTypeRules,
    prohibited: active.prohibited,
    imagePrompt: generation.imagePrompt || GENERATION_IMAGE_PROMPT_GUIDELINES,
    imageValidation: active.imageValidation,
    contentTypeDefinition: definition,
    contentTypeIdentity: definition
      ? { id: definition.id, label: definition.label, guidelineVersion: active.version }
      : null,
  }
}
