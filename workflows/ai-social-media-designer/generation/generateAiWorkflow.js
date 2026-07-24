import { fetch, getWorkflowMetadata } from 'workflow'
import { z } from 'zod'
import { CONTENT_TYPES, PLATFORMS, shouldGenerateImagePrompt } from '../../../lib/ai-constants'
import { resolveGenerationGuidelinesForRequest } from '../../../lib/ai-guidelines'
import {
  buildOpenRouterChatBody,
  extractOpenRouterUsage,
  mergeOpenRouterUsage,
} from '../../../lib/ai-openrouter'
import {
  applyImageAssetFallbackToDraft,
  buildGeneratedImageAsset,
  parseOpenRouterImageResponse,
  recordImageGenerationSpend,
  resolveImageGenerationGate,
} from '../../../lib/ai-image-generation'
import { buildGenerationHistoryRecord } from '../../../lib/ai-run-history'
import { persistRunHistory } from '../../../lib/run-history-store'

// ---------- Generation schemas (Phase 2A text; Phase 2D prompts; Phase 2E assets) ----------

export const AiGeneratedImageSchema = z.object({
  assetId: z.string(),
  status: z.enum(['draft', 'failed']),
  rationale: z.string().optional(),
  mimeType: z.string().optional(),
  dataUrl: z.string().optional(),
  downloadFileName: z.string().optional(),
  error: z.string().optional(),
})

export const AiDraftVariantSchema = z.object({
  platform: z.enum(PLATFORMS),
  contentType: z.string(),
  draftText: z.string(),
  rationale: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  missingInformation: z.array(z.string()).optional(),
  imagePrompt: z.string().optional(),
  imageRationale: z.string().optional(),
  generatedImages: z.array(AiGeneratedImageSchema).optional(),
})

const AiImagePromptEntrySchema = z.object({
  platform: z.enum(PLATFORMS),
  imagePrompt: z.string(),
  imageRationale: z.string().optional(),
})

export const AiImagePromptsResultSchema = z.object({
  imagePrompts: z.array(AiImagePromptEntrySchema),
})

export const AiGenerationResultSchema = z.object({
  drafts: z.array(AiDraftVariantSchema).min(1),
  recommendedNextStep: z.string(),
  humanReviewRequired: z.literal(true),
})

export const GenerateInputSchema = z.object({
  userId: z.string(),
  userEmail: z.string().email(),
  intent: z.string().min(1),
  topic: z.string().min(1),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(3),
  contentType: z.enum(CONTENT_TYPES),
  tone: z.string().optional(),
  audience: z.string().optional(),
  cta: z.string().optional(),
  knownFacts: z.array(z.string()).optional(),
  eventDetails: z.record(z.any()).optional(),
  hashtags: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  imageStyle: z.string().optional(),
  imageConstraints: z.string().optional(),
})

function extractFirstJsonObject(text) {
  const cleaned = text
    .replace(/```(?:json)?/g, '')
    .replace(/```/g, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export function buildFallbackGenerationResult(input, reason) {
  const platforms =
    Array.isArray(input?.platforms) && input.platforms.length ? input.platforms : ['instagram']
  const contentType = input?.contentType || 'regular_post'

  return AiGenerationResultSchema.parse({
    drafts: platforms.map((platform) => ({
      platform,
      contentType,
      draftText: '',
      rationale: `No fue posible generar automáticamente: ${reason}.`,
      assumptions: [],
      missingInformation: [
        'La generación automática falló; completa el borrador manualmente y valida antes de publicar.',
      ],
    })),
    recommendedNextStep:
      'Revisar la solicitud, completar datos faltantes y volver a intentar. Validar cualquier borrador antes de aprobar.',
    humanReviewRequired: true,
  })
}

// ---------- Deterministic output guardrails (Phase 2C) ----------

const X_MAX_CHARS = 280

const APPROVAL_CLAIM_PATTERNS = [
  /aprobad[oa]s?\s+(?:oficialmente\s+)?por\s+(?:la\s+)?SAC/i,
  /avalad[oa]s?\s+(?:oficialmente\s+)?por\s+(?:la\s+)?SAC/i,
  /SAC\s+(?:aprueba|avala|certifica)/i,
  /oficialmente\s+aprobad[oa]/i,
  /list[oa]\s+para\s+publicar\s+sin\s+revisi[oó]n/i,
]

const EVENT_DETAIL_CHECKS = [
  { field: 'name', label: 'Nombre del evento', keyword: /nombre/i },
  { field: 'date', label: 'Fecha del evento', keyword: /fecha/i },
  { field: 'time', label: 'Hora del evento', keyword: /hora/i },
  { field: 'location', label: 'Lugar del evento', keyword: /lugar|ubicaci/i },
]

function hasApprovalClaim(text) {
  if (!text) return false
  return APPROVAL_CLAIM_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Deterministic post-processing of a model-produced generation result:
 * - exactly one draft per requested platform (requested contentType enforced)
 * - assumptions/missingInformation always arrays
 * - approval-claim phrases flagged for human review (never silently rewritten)
 * - event_promotion: unprovided event details surfaced in missingInformation
 * - X drafts over the character limit flagged
 * - humanReviewRequired always true
 *
 * Pure function — returns a schema-valid AiGenerationResult.
 */
export function applyGenerationGuardrails(result, input) {
  const byPlatform = new Map(
    (Array.isArray(result?.drafts) ? result.drafts : []).map((d) => [d.platform, d])
  )

  const missingEventDetails =
    input.contentType === 'event_promotion'
      ? EVENT_DETAIL_CHECKS.filter((check) => {
          const value = input.eventDetails?.[check.field]
          return !(typeof value === 'string' && value.trim())
        })
      : []
  const missingCta = input.contentType === 'event_promotion' && !input.cta

  const drafts = input.platforms.map((platform) => {
    const existing = byPlatform.get(platform)

    if (!existing) {
      return {
        platform,
        contentType: input.contentType,
        draftText: '',
        rationale: 'No se generó borrador para esta plataforma.',
        assumptions: [],
        missingInformation: ['Borrador ausente; completar manualmente.'],
      }
    }

    const assumptions = Array.isArray(existing.assumptions) ? [...existing.assumptions] : []
    const missingInformation = Array.isArray(existing.missingInformation)
      ? [...existing.missingInformation]
      : []

    if (hasApprovalClaim(existing.draftText)) {
      missingInformation.push(
        'El borrador sugiere aprobación oficial de SAC; eliminar o reformular antes de publicar.'
      )
    }

    for (const check of missingEventDetails) {
      const alreadyListed = missingInformation.some((item) => check.keyword.test(item))
      if (!alreadyListed) {
        missingInformation.push(`${check.label}: no provisto; no se inventó.`)
      }
    }
    if (missingCta && !missingInformation.some((item) => /cta|registro|llamad/i.test(item))) {
      missingInformation.push('CTA del evento: no provista; no se inventó.')
    }

    if (platform === 'x' && (existing.draftText?.length || 0) > X_MAX_CHARS) {
      missingInformation.push(
        `El borrador excede el límite de ${X_MAX_CHARS} caracteres de X (${existing.draftText.length}); acortar antes de publicar.`
      )
    }

    return {
      ...existing,
      contentType: input.contentType,
      assumptions,
      missingInformation,
      imagePrompt: existing.imagePrompt,
      imageRationale: existing.imageRationale,
      generatedImages: existing.generatedImages,
    }
  })

  return AiGenerationResultSchema.parse({
    drafts,
    recommendedNextStep:
      result?.recommendedNextStep ||
      'Validar los borradores generados antes de aprobar o publicar.',
    humanReviewRequired: true,
  })
}

// ---------- Image prompt guardrails (Phase 2D) ----------

const DEFAULT_IMAGE_SAFETY_SUFFIX =
  'No identifiable faces, no minors, no private information, no official logos, no text overlay, no copyrighted art styles.'

const IMAGE_PROMPT_RISK_PATTERNS = [
  {
    pattern: /\b(?:portrait|retrato)\s+of\b/i,
    message: 'El prompt de imagen sugiere retrato identificable; revisar antes de generar.',
  },
  {
    pattern: /\b(?:minor|child|children|niñ[oa]s?)\b/i,
    message: 'El prompt de imagen menciona menores; revisar antes de generar.',
  },
  {
    pattern: /(?:SAC|Sociedad de Astronomía).{0,30}(?:logo|emblema|sello)/i,
    message: 'El prompt de imagen podría incluir logo oficial de SAC; revisar antes de generar.',
  },
  {
    pattern: /foto\s+(?:real|documental)|photorealistic\s+documentary/i,
    message:
      'El prompt sugiere foto documental real; usar estilo ilustrado o genérico para borradores de IA.',
  },
]

function collectProvidedFactStrings(input) {
  const facts = []
  if (Array.isArray(input.knownFacts)) {
    facts.push(...input.knownFacts.map((f) => String(f).toLowerCase()))
  }
  if (input.eventDetails && typeof input.eventDetails === 'object') {
    for (const value of Object.values(input.eventDetails)) {
      if (typeof value === 'string' && value.trim()) {
        facts.push(value.trim().toLowerCase())
      }
    }
  }
  if (input.cta) facts.push(String(input.cta).toLowerCase())
  return facts
}

function imagePromptHasSafetyConstraints(imagePrompt) {
  const lower = imagePrompt.toLowerCase()
  return (
    lower.includes('no identifiable') ||
    lower.includes('sin rostros identificables') ||
    lower.includes('no official logo') ||
    lower.includes('sin logo oficial') ||
    lower.includes('no minors') ||
    lower.includes('sin menores')
  )
}

function ensureImagePromptSafetySuffix(imagePrompt) {
  if (!imagePrompt?.trim()) return imagePrompt
  if (imagePromptHasSafetyConstraints(imagePrompt)) return imagePrompt.trim()
  return `${imagePrompt.trim()}; ${DEFAULT_IMAGE_SAFETY_SUFFIX}`
}

/**
 * Apply deterministic guardrails to imagePrompt/imageRationale on a single draft.
 * Pure function — returns an updated draft object.
 */
export function applyImagePromptGuardrailsToDraft(draft, input) {
  if (!draft.imagePrompt?.trim()) return draft

  const missingInformation = Array.isArray(draft.missingInformation)
    ? [...draft.missingInformation]
    : []
  let imagePrompt = draft.imagePrompt.trim()

  if (hasApprovalClaim(imagePrompt)) {
    missingInformation.push(
      'El prompt de imagen sugiere aprobación oficial de SAC; reformular antes de generar.'
    )
  }

  for (const { pattern, message } of IMAGE_PROMPT_RISK_PATTERNS) {
    if (pattern.test(imagePrompt) && !missingInformation.includes(message)) {
      missingInformation.push(message)
    }
  }

  const providedFacts = collectProvidedFactStrings(input)
  const dateLike = imagePrompt.match(/\b\d{1,2}\s+de\s+\w+\b|\b\d{4}-\d{2}-\d{2}\b/gi) || []
  for (const fragment of dateLike) {
    const normalized = fragment.toLowerCase()
    const covered = providedFacts.some((fact) => fact.includes(normalized))
    if (!covered) {
      const msg = `El prompt de imagen incluye fecha "${fragment}" no provista en los datos; revisar.`
      if (!missingInformation.some((item) => item.includes(fragment))) {
        missingInformation.push(msg)
      }
    }
  }

  imagePrompt = ensureImagePromptSafetySuffix(imagePrompt)

  if (input.imageConstraints?.trim()) {
    const constraintLower = input.imageConstraints.trim().toLowerCase()
    if (!imagePrompt.toLowerCase().includes(constraintLower.slice(0, 20))) {
      missingInformation.push(
        'Verificar que el prompt de imagen refleje las restricciones indicadas por el usuario.'
      )
    }
  }

  return {
    ...draft,
    imagePrompt,
    missingInformation,
  }
}

/**
 * Merge image prompts into text drafts and apply image prompt guardrails.
 */
export function mergeImagePromptsIntoResult(textResult, imagePrompts, input) {
  const byPlatform = new Map(
    (Array.isArray(imagePrompts) ? imagePrompts : []).map((entry) => [entry.platform, entry])
  )

  const drafts = textResult.drafts.map((draft) => {
    const promptEntry = byPlatform.get(draft.platform)
    const merged = {
      ...draft,
      imagePrompt: promptEntry?.imagePrompt?.trim() || draft.imagePrompt,
      imageRationale: promptEntry?.imageRationale?.trim() || draft.imageRationale,
    }
    return applyImagePromptGuardrailsToDraft(merged, input)
  })

  return AiGenerationResultSchema.parse({
    ...textResult,
    drafts,
    humanReviewRequired: true,
  })
}

async function validatePayloadStep(input) {
  'use step'
  const parsed = GenerateInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'Input inválido (schema)',
      fallback: buildFallbackGenerationResult(
        {
          userId: input.userId || 'unknown',
          userEmail: input.userEmail || 'unknown@example.com',
          intent: input.intent || '',
          topic: input.topic || '',
          platforms: input.platforms,
          contentType: input.contentType,
        },
        'Input inválido'
      ),
    }
  }

  return { ok: true, value: parsed.data }
}

async function loadGuidelinesStep(input) {
  'use step'
  const byPlatform = {}
  for (const platform of input.platforms) {
    byPlatform[platform] = await resolveGenerationGuidelinesForRequest({
      platform,
      contentType: input.contentType,
    })
  }

  const version =
    byPlatform[input.platforms[0]]?.version ||
    Object.values(byPlatform)[0]?.version ||
    'mvp-default-v1'

  return {
    version,
    platforms: byPlatform,
  }
}

async function generateTextStep(input, guidelines) {
  'use step'

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite-image'

  if (!apiKey) {
    return {
      ok: false,
      reason: 'Falta OPENROUTER_API_KEY',
      model,
      result: buildFallbackGenerationResult(input, 'Falta configuración del provider'),
      usage: null,
    }
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  const firstPlatformGuidelines = guidelines.platforms[input.platforms[0]] || {}

  const platformSections = input.platforms
    .map((platform) => {
      const rules = guidelines.platforms[platform]?.platform || 'Reglas generales de plataforma.'
      return `- ${platform}: ${rules}`
    })
    .join('\n')

  const systemPrompt = `Eres un generador de borradores de redes sociales para SAC (Sociedad de Astronomía del Caribe).
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "drafts": [
    {
      "platform": "x" | "instagram" | "facebook",
      "contentType": string,
      "draftText": string (español),
      "rationale": string (opcional),
      "assumptions": string[],
      "missingInformation": string[]
    }
  ],
  "recommendedNextStep": string,
  "humanReviewRequired": true
}

GUÍAS DE SAC (versión ${guidelines.version}) — cúmplelas al redactar:

[Globales]
${firstPlatformGuidelines.global || ''}

[Por plataforma]
${platformSections}

[Tipo de contenido]
${firstPlatformGuidelines.contentType || ''}

[Contenido prohibido]
${firstPlatformGuidelines.prohibited || ''}

Reglas de salida:
- Usa EXACTAMENTE esas claves. "humanReviewRequired" debe ser siempre true.
- Incluye exactamente un draft por cada plataforma solicitada (mismas plataformas, mismo contentType).
- Idioma: español (por defecto), tono adecuado a SAC / Puerto Rico.
- Preserva los hechos provistos (knownFacts, eventDetails, enlaces) tal cual, sin alterarlos.
- NO inventes fechas, horarios, lugares, costos, enlaces ni hechos científicos no provistos.
- Si falta información crítica, deja huecos claros en "missingInformation" y NO rellenes con datos inventados.
- Registra en "assumptions" cualquier supuesto tomado; usa [] si no hay.
- NO afirmes aprobación oficial de SAC ni que el contenido está listo para publicar sin revisión humana.
- "recommendedNextStep" debe sugerir validar el borrador antes de aprobar/publicar.
`

  const userText = {
    intent: input.intent,
    topic: input.topic,
    platforms: input.platforms,
    contentType: input.contentType,
    tone: input.tone,
    audience: input.audience,
    cta: input.cta,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    hashtags: input.hashtags,
    links: input.links,
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Generar borradores de texto y retornar AiGenerationResult.
Input (JSON): ${JSON.stringify(userText)}`,
    },
  ]

  const attempt = async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify(
        buildOpenRouterChatBody({
          model,
          messages,
          temperature: 0.4,
          forceJson: true,
        })
      ),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${res.status}: ${text}`)
    }

    const data = await res.json()
    const usage = extractOpenRouterUsage(data, model)
    const assistantText = data?.choices?.[0]?.message?.content
    if (!assistantText || typeof assistantText !== 'string') {
      const err = new Error('Respuesta del provider sin contenido')
      err.usage = usage
      throw err
    }

    const json = extractFirstJsonObject(assistantText)
    if (!json) {
      const err = new Error('No se pudo extraer JSON del contenido')
      err.usage = usage
      throw err
    }

    // Normalize humanReviewRequired in case the model omitted it
    if (json.humanReviewRequired !== true) {
      json.humanReviewRequired = true
    }

    const validated = AiGenerationResultSchema.parse(json)

    return {
      result: applyGenerationGuardrails(validated, input),
      usage,
    }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return { ok: true, model, result: first.result, usage: first.usage }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    try {
      const second = await attempt()
      return {
        ok: true,
        model,
        result: second.result,
        usage: mergeOpenRouterUsage(accumulatedUsage, second.usage),
      }
    } catch (err2) {
      accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err2?.usage || null)
      return {
        ok: false,
        model,
        reason: err1?.message || 'Fallo provider/modelo',
        result: buildFallbackGenerationResult(input, err1?.message || 'Fallo provider/modelo'),
        usage: accumulatedUsage,
      }
    }
  }
}

async function generateImagePromptsStep(input, textResult, guidelines) {
  'use step'

  if (!shouldGenerateImagePrompt(input.contentType, input)) {
    return { ok: true, skipped: true, result: textResult, usage: null }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite-image'

  if (!apiKey) {
    const drafts = textResult.drafts.map((draft) => ({
      ...draft,
      missingInformation: [
        ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
        'No se pudo generar prompt de imagen: falta configuración del provider.',
      ],
    }))
    return {
      ok: false,
      skipped: false,
      result: AiGenerationResultSchema.parse({ ...textResult, drafts, humanReviewRequired: true }),
      usage: null,
    }
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE
  const firstPlatformGuidelines = guidelines.platforms[input.platforms[0]] || {}

  const platformSections = input.platforms
    .map((platform) => {
      const rules = guidelines.platforms[platform]?.platform || 'Reglas generales de plataforma.'
      return `- ${platform}: ${rules}`
    })
    .join('\n')

  const systemPrompt = `Eres un generador de prompts de imagen para borradores de redes sociales de SAC (Sociedad de Astronomía del Caribe).
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "imagePrompts": [
    {
      "platform": "x" | "instagram" | "facebook",
      "imagePrompt": string (inglés o español, descripción visual para generador de imágenes),
      "imageRationale": string (español, por qué el prompt apoya el borrador)
    }
  ]
}

GUÍAS DE SAC (versión ${guidelines.version}) — cúmplelas al redactar prompts:

[Prompts de imagen]
${firstPlatformGuidelines.imagePrompt || ''}

[Globales]
${firstPlatformGuidelines.global || ''}

[Por plataforma]
${platformSections}

[Tipo de contenido]
${firstPlatformGuidelines.contentType || ''}

[Contenido prohibido]
${firstPlatformGuidelines.prohibited || ''}

[Validación de imagen]
${firstPlatformGuidelines.imageValidation || ''}

Reglas:
- Incluye exactamente un imagePrompt por cada plataforma en la solicitud.
- Alinea cada prompt con el borrador de texto de esa plataforma y el tema; NO inventes hechos no provistos.
- NO personas identificables, menores, datos privados, logos oficiales ni estilos con copyright.
- NO fechas, horarios, lugares, costos ni enlaces específicos que no estén en los datos provistos.
- Incluye restricciones de seguridad explícitas en cada imagePrompt.
- Respeta imageStyle e imageConstraints del usuario cuando estén provistos.
- NO generes assets de imagen; solo el prompt de texto.
`

  const userPayload = {
    intent: input.intent,
    topic: input.topic,
    contentType: input.contentType,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    drafts: textResult.drafts.map((d) => ({
      platform: d.platform,
      draftText: d.draftText,
      assumptions: d.assumptions,
      missingInformation: d.missingInformation,
    })),
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Generar imagePrompt e imageRationale por plataforma.
Input (JSON): ${JSON.stringify(userPayload)}`,
    },
  ]

  const attempt = async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify(
        buildOpenRouterChatBody({
          model,
          messages,
          temperature: 0.3,
          forceJson: true,
        })
      ),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${res.status}: ${text}`)
    }

    const data = await res.json()
    const usage = extractOpenRouterUsage(data, model)
    const assistantText = data?.choices?.[0]?.message?.content
    if (!assistantText || typeof assistantText !== 'string') {
      const err = new Error('Respuesta del provider sin contenido')
      err.usage = usage
      throw err
    }

    const json = extractFirstJsonObject(assistantText)
    if (!json) {
      const err = new Error('No se pudo extraer JSON del contenido')
      err.usage = usage
      throw err
    }

    const validated = AiImagePromptsResultSchema.parse(json)
    const result = mergeImagePromptsIntoResult(textResult, validated.imagePrompts, input)

    return { result, usage }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return { ok: true, skipped: false, result: first.result, usage: first.usage }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    try {
      const second = await attempt()
      return {
        ok: true,
        skipped: false,
        result: second.result,
        usage: mergeOpenRouterUsage(accumulatedUsage, second.usage),
      }
    } catch (err2) {
      accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err2?.usage || null)
      const drafts = textResult.drafts.map((draft) => ({
        ...draft,
        missingInformation: [
          ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
          'No se pudo generar prompt de imagen automáticamente; completar manualmente.',
        ],
      }))
      return {
        ok: false,
        skipped: false,
        result: AiGenerationResultSchema.parse({
          ...textResult,
          drafts,
          humanReviewRequired: true,
        }),
        usage: accumulatedUsage,
      }
    }
  }
}

const IMAGE_GATE_REASON_MESSAGES = {
  missing_api_key: 'falta configuración del provider',
  monthly_spend_ceiling: 'límite mensual de gasto alcanzado',
  run_cost_limit: 'límite de costo por ejecución alcanzado',
}

async function generateImageAssetsStep(input, promptResult, priorUsage) {
  'use step'

  if (!shouldGenerateImagePrompt(input.contentType, input)) {
    return { ok: true, skipped: true, result: promptResult, usage: null }
  }

  const runCostUsd = priorUsage?.cost?.amount || 0
  const initialGate = resolveImageGenerationGate({ accumulatedRunCostUsd: runCostUsd })
  if (!initialGate.allowed) {
    return {
      ok: true,
      skipped: true,
      skippedReason: initialGate.reason,
      result: promptResult,
      usage: null,
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = initialGate.config.model
  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  let accumulatedUsage = null
  let accumulatedImageCost = 0
  const updatedDrafts = []

  for (const draft of promptResult.drafts) {
    if (!draft.imagePrompt?.trim()) {
      updatedDrafts.push(draft)
      continue
    }

    const gate = resolveImageGenerationGate({
      accumulatedRunCostUsd: runCostUsd + accumulatedImageCost,
    })
    if (!gate.allowed) {
      updatedDrafts.push(
        applyImageAssetFallbackToDraft(
          draft,
          IMAGE_GATE_REASON_MESSAGES[gate.reason] || gate.reason
        )
      )
      continue
    }

    try {
      // Same OPENROUTER_MODEL as text steps; multimodal models return images via chat completions.
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
          ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
        },
        body: JSON.stringify(
          buildOpenRouterChatBody({
            model,
            messages: [
              {
                role: 'user',
                content: `Genera una sola imagen de borrador para redes sociales de SAC a partir de este prompt. No inventes hechos no incluidos.\n\n${draft.imagePrompt}`,
              },
            ],
            modalities: ['image', 'text'],
          })
        ),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`OpenRouter HTTP ${res.status}: ${text}`)
      }

      const data = await res.json()
      const parsedImage = parseOpenRouterImageResponse(data)
      const usage = extractOpenRouterUsage(data, model)
      accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, usage)

      if (usage?.cost?.amount) {
        accumulatedImageCost += usage.cost.amount
        recordImageGenerationSpend(usage.cost.amount)
      }

      if (!parsedImage?.dataUrl) {
        throw new Error('Respuesta del provider sin imagen')
      }

      const asset = buildGeneratedImageAsset({
        platform: draft.platform,
        dataUrl: parsedImage.dataUrl,
        mimeType: parsedImage.mimeType,
        rationale: draft.imageRationale || 'Borrador visual generado a partir del prompt.',
      })

      updatedDrafts.push({
        ...draft,
        generatedImages: [asset],
      })
    } catch (err) {
      updatedDrafts.push(
        applyImageAssetFallbackToDraft(draft, err?.message || 'fallo del provider')
      )
    }
  }

  return {
    ok: true,
    skipped: false,
    result: AiGenerationResultSchema.parse({
      ...promptResult,
      drafts: updatedDrafts,
      humanReviewRequired: true,
    }),
    usage: accumulatedUsage,
  }
}

/**
 * Build + persist history inside a step.
 * Node crypto (userKey hash) and AWS SDK are not allowed in the workflow VM.
 * Soft-fail: never rewrite client terminal status on history errors.
 */
async function persistGenerationHistoryStep(payload) {
  'use step'
  try {
    const record = buildGenerationHistoryRecord(payload)
    await persistRunHistory(record)
  } catch (error) {
    console.error('generateAiWorkflow: failed to persist run history', error)
  }
  return null
}

export async function generateAiWorkflow(input) {
  'use workflow'

  const meta = getWorkflowMetadata()
  const runId = meta?.workflowRunId
  const startedAt =
    meta?.workflowStartedAt instanceof Date
      ? meta.workflowStartedAt.toISOString()
      : new Date().toISOString()

  const validatedInputResult = await validatePayloadStep(input)
  if (!validatedInputResult.ok) {
    if (runId) {
      await persistGenerationHistoryStep({
        input,
        runId,
        status: 'failed',
        error: { message: 'payload_invalid', retryable: false },
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: null,
      })
    }
    return { result: validatedInputResult.fallback, usage: null, guidelineVersion: null }
  }

  const validatedInput = validatedInputResult.value
  const guidelines = await loadGuidelinesStep(validatedInput)
  const textResult = await generateTextStep(validatedInput, guidelines)
  const imagePromptResult = await generateImagePromptsStep(
    validatedInput,
    textResult.result,
    guidelines
  )
  const usageAfterPrompts = mergeOpenRouterUsage(textResult.usage, imagePromptResult.usage)
  const imageAssetResult = await generateImageAssetsStep(
    validatedInput,
    imagePromptResult.result,
    usageAfterPrompts
  )
  const usage = mergeOpenRouterUsage(usageAfterPrompts, imageAssetResult.usage)
  const completedAt = new Date().toISOString()

  if (runId) {
    await persistGenerationHistoryStep({
      input: validatedInput,
      runId,
      status: 'completed',
      result: imageAssetResult.result,
      startedAt,
      completedAt,
      guidelineVersion: guidelines.version,
      usage,
    })
  }

  return {
    result: imageAssetResult.result,
    usage,
    guidelineVersion: guidelines.version,
  }
}
