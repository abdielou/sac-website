import { fetch, getWorkflowMetadata } from 'workflow'
import { z } from 'zod'
import {
  CONTENT_TYPES,
  GENERATION_INPUT_LIMITS,
  PLATFORMS,
  contentTypeRequiresEventCta,
  getCanonicalEventName,
  isEventContentType,
  shouldGenerateImagePrompt,
} from '../../../lib/ai-constants'
import {
  getActiveGuidelines,
  resolveGenerationGuidelinesFromDocument,
} from '../../../lib/ai-guidelines'
import {
  buildOpenRouterChatBody,
  extractOpenRouterUsage,
  mergeOpenRouterUsage,
} from '../../../lib/ai-openrouter'
import {
  applyImageAssetFallbackToDraft,
  buildGeneratedImageAsset,
  getImageGenerationConfig,
  parseOpenRouterImageResponse,
} from '../../../lib/ai-image-generation'
import { buildGenerationHistoryRecord } from '../../../lib/ai-run-history'
import { persistRunHistory } from '../../../lib/run-history-store'
import { getBackgroundById } from '../../../lib/social-template/backgroundCatalog'
import { attachTemplateRequestsToResult } from '../../../lib/social-template/buildTemplateTextFields'
import {
  SPONSOR_MAX_BYTES,
  validateSponsorLogo,
} from '../../../lib/social-template/eventFormHelpers'
import { resolveTemplateLayoutId } from '../../../lib/social-template/templateLayouts'

const OPENROUTER_TEXT_TIMEOUT_MS = 30_000
const OPENROUTER_IMAGE_TIMEOUT_MS = 60_000
const OPENROUTER_TEXT_MAX_TOKENS = 2_000
const OPENROUTER_IMAGE_MAX_TOKENS = 2_048

// ---------- Generation schemas (Phase 2A text; Phase 2D prompts; Phase 2E assets) ----------

const MAX_SPONSOR_DATA_URL_LENGTH = Math.ceil((SPONSOR_MAX_BYTES * 4) / 3) + 128
const MAX_PLATFORM_INPUTS = PLATFORMS.length * 4

const boundedRequiredString = (max) => z.string().trim().min(1).max(max)
const boundedOptionalString = (max) => boundedRequiredString(max).optional()
const boundedStringList = z
  .array(boundedRequiredString(GENERATION_INPUT_LIMITS.listItem))
  .max(GENERATION_INPUT_LIMITS.listItems)

export const AiGeneratedImageSchema = z
  .object({
    assetId: boundedRequiredString(200),
    status: z.enum(['draft', 'failed']),
    rationale: boundedOptionalString(4000),
    mimeType: boundedOptionalString(100),
    dataUrl: boundedOptionalString(20_000_000),
    downloadFileName: boundedOptionalString(255),
    error: boundedOptionalString(1000),
  })
  .strict()

const AiSponsorLogoSchema = z
  .object({
    dataUrl: boundedRequiredString(MAX_SPONSOR_DATA_URL_LENGTH),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']).optional(),
    fileName: boundedOptionalString(GENERATION_INPUT_LIMITS.sponsorFileName),
  })
  .strict()
  .superRefine((value, ctx) => {
    const validation = validateSponsorLogo(value)
    if (!validation.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error,
        path: ['dataUrl'],
      })
    }
  })

const AiTemplateRequestSchema = z
  .object({
    layout: z.enum(['event', 'simple']),
    textFields: z
      .object({
        headline: boundedRequiredString(500),
        subtitle: boundedOptionalString(1000),
        body: boundedOptionalString(1000),
        dateLabel: boundedOptionalString(100),
        timeLabel: boundedOptionalString(100),
        locationLabel: boundedOptionalString(500),
        weatherDisclaimer: boundedOptionalString(500),
      })
      .strict(),
  })
  .strict()

const AiTemplateBackgroundSourceSchema = z
  .object({
    mode: z.enum(['stock', 'ai_generated']),
    backgroundId: boundedOptionalString(100),
    dataUrl: boundedOptionalString(20_000_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'stock' && !value.backgroundId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'backgroundId es obligatorio para fondos stock',
        path: ['backgroundId'],
      })
    }
    if (value.mode === 'ai_generated' && !value.dataUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dataUrl es obligatorio para fondos generados',
        path: ['dataUrl'],
      })
    }
  })

const AiTemplateAssetsSchema = z
  .object({
    backgroundSource: AiTemplateBackgroundSourceSchema,
    sponsorLogo: AiSponsorLogoSchema.optional(),
  })
  .strict()

export const AiDraftVariantSchema = z
  .object({
    platform: z.enum(PLATFORMS),
    contentType: z.enum(CONTENT_TYPES),
    draftText: boundedRequiredString(20_000),
    rationale: boundedOptionalString(4000),
    assumptions: z.array(boundedRequiredString(2000)).max(50).optional(),
    missingInformation: z.array(boundedRequiredString(2000)).max(50).optional(),
    imagePrompt: boundedOptionalString(20_000),
    imageRationale: boundedOptionalString(4000),
  })
  .strict()

export const AiSharedCaptionResultSchema = z
  .object({
    caption: z
      .object({
        contentType: z.enum(CONTENT_TYPES),
        draftText: boundedRequiredString(280),
        rationale: boundedOptionalString(4000),
        assumptions: z.array(boundedRequiredString(2000)).max(50).optional(),
        missingInformation: z.array(boundedRequiredString(2000)).max(50).optional(),
      })
      .strict(),
    recommendedNextStep: boundedRequiredString(4000),
    humanReviewRequired: z.literal(true),
  })
  .strict()

const AiImagePromptEntrySchema = z
  .object({
    platform: z.enum(PLATFORMS),
    imagePrompt: boundedRequiredString(20_000),
    imageRationale: boundedOptionalString(4000),
  })
  .strict()

export const AiImagePromptsResultSchema = z
  .object({
    imagePrompts: z.array(AiImagePromptEntrySchema).min(1).max(PLATFORMS.length),
  })
  .strict()

export const AiGenerationResultSchema = z
  .object({
    drafts: z.array(AiDraftVariantSchema).min(1).max(PLATFORMS.length),
    recommendedNextStep: boundedRequiredString(4000),
    humanReviewRequired: z.literal(true),
    generatedImage: AiGeneratedImageSchema.optional(),
    templateRequest: AiTemplateRequestSchema.optional(),
    templateAssets: AiTemplateAssetsSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.templateRequest) !== Boolean(value.templateAssets)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'templateRequest y templateAssets deben estar presentes juntos',
        path: ['templateRequest'],
      })
    }
  })

function isValidIsoCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

const EventDateSchema = boundedRequiredString(GENERATION_INPUT_LIMITS.eventDate)
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe usar el formato YYYY-MM-DD')
  .refine(isValidIsoCalendarDate, 'La fecha no es válida')

const EventTimeSchema = boundedRequiredString(GENERATION_INPUT_LIMITS.eventTime)
  .regex(/^\d{2}:\d{2}$/, 'La hora debe usar el formato HH:MM')
  .refine((value) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
  }, 'La hora no es válida')

const EventDetailsSchema = z
  .object({
    name: boundedRequiredString(GENERATION_INPUT_LIMITS.eventName),
    date: EventDateSchema,
    time: EventTimeSchema,
    location: boundedRequiredString(GENERATION_INPUT_LIMITS.eventLocation),
  })
  .strict()

const NormalizedPlatformsSchema = z
  .array(z.enum(PLATFORMS))
  .min(1)
  .max(MAX_PLATFORM_INPUTS)
  .transform((platforms) => [...new Set(platforms)])
  .refine((platforms) => platforms.length <= PLATFORMS.length, {
    message: `Máximo ${PLATFORMS.length} plataformas`,
  })

export const GenerateInputSchema = z
  .object({
    userId: boundedRequiredString(256),
    userEmail: z.string().trim().email().max(254),
    intent: boundedRequiredString(GENERATION_INPUT_LIMITS.intent),
    topic: boundedRequiredString(GENERATION_INPUT_LIMITS.topic),
    platforms: NormalizedPlatformsSchema,
    contentType: z.enum(CONTENT_TYPES),
    tone: boundedOptionalString(GENERATION_INPUT_LIMITS.tone),
    audience: boundedOptionalString(GENERATION_INPUT_LIMITS.audience),
    cta: boundedOptionalString(GENERATION_INPUT_LIMITS.cta),
    knownFacts: boundedStringList.optional(),
    eventDetails: EventDetailsSchema.optional(),
    hashtags: boundedStringList.optional(),
    links: boundedStringList.optional(),
    imageStyle: boundedOptionalString(GENERATION_INPUT_LIMITS.imageStyle),
    imageConstraints: boundedOptionalString(GENERATION_INPUT_LIMITS.imageConstraints),
    backgroundMode: z.enum(['stock', 'ai_generated']).optional(),
    backgroundId: boundedOptionalString(100),
    sponsorLogo: AiSponsorLogoSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (isEventContentType(value.contentType)) {
      if (!value.eventDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `eventDetails es obligatorio para ${value.contentType}`,
          path: ['eventDetails'],
        })
      }
      if (!value.cta && contentTypeRequiresEventCta(value.contentType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `cta es obligatorio para ${value.contentType}`,
          path: ['cta'],
        })
      }
    }

    const canonicalEventName = getCanonicalEventName(value.contentType)
    if (
      canonicalEventName &&
      value.eventDetails &&
      value.eventDetails.name !== canonicalEventName
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El nombre debe coincidir con la etiqueta canónica vigente (${canonicalEventName}) para ${value.contentType}`,
        path: ['eventDetails', 'name'],
      })
    }

    if (value.backgroundMode && !resolveTemplateLayoutId(value.contentType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El tipo de contenido no admite plantilla visual',
        path: ['backgroundMode'],
      })
    }

    if (value.backgroundMode === 'stock') {
      if (!value.backgroundId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'backgroundId es obligatorio cuando backgroundMode es stock',
          path: ['backgroundId'],
        })
      } else if (!getBackgroundById(value.backgroundId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Fondo stock desconocido',
          path: ['backgroundId'],
        })
      }
    } else if (value.backgroundId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'backgroundId solo se admite con backgroundMode stock',
        path: ['backgroundId'],
      })
    }

    if (value.sponsorLogo) {
      if (!isEventContentType(value.contentType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sponsorLogo solo se admite para publicaciones de eventos',
          path: ['sponsorLogo'],
        })
      }
      if (!value.backgroundMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sponsorLogo requiere una plantilla visual',
          path: ['sponsorLogo'],
        })
      }
    }
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

  const sharedDraft = {
    contentType,
    draftText: 'Generación no disponible. Completa este borrador manualmente.',
    rationale: `No fue posible generar automáticamente: ${reason}.`,
    assumptions: [],
    missingInformation: [
      'La generación automática falló; completa el borrador manualmente y valida antes de publicar.',
    ],
  }

  return AiGenerationResultSchema.parse({
    drafts: platforms.map((platform) => ({ ...sharedDraft, platform })),
    recommendedNextStep:
      'Revisar la solicitud, completar datos faltantes y volver a intentar. Validar cualquier borrador antes de aprobar.',
    humanReviewRequired: true,
  })
}

// ---------- Deterministic output guardrails (Phase 2C) ----------

const X_MAX_CHARS = 280
const HASHTAG_PATTERN = /(^|\s)#[\p{L}\p{N}_-]+/gu
const CAMPAIGN_PATTERN = /\b(?:campa(?:ñ|n)a|campaign)\b/i
const REQUIRED_HASHTAG_PATTERN =
  /(?:requier\w*|obligatori\w*|debe[n]?\s+incluir|incluir\s+obligatoriamente)[^\n.]{0,80}hashtags?|hashtags?[^\n.]{0,80}(?:requerid\w*|obligatori\w*)/i

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

function hasIdentifiableCampaign(input) {
  const campaignContext = [
    input?.intent,
    input?.topic,
    input?.cta,
    ...(Array.isArray(input?.knownFacts) ? input.knownFacts : []),
  ]
    .filter(Boolean)
    .join(' ')

  return CAMPAIGN_PATTERN.test(campaignContext)
}

function activeGuidelinesRequireHashtags(guidelines) {
  if (!guidelines) return false

  const rules = Object.values(guidelines.platforms || {})
    .flatMap((platform) =>
      platform && typeof platform === 'object' ? Object.values(platform) : [platform]
    )
    .filter((rule) => typeof rule === 'string')
    .join('\n')

  return REQUIRED_HASHTAG_PATTERN.test(rules)
}

export function shouldIncludeHashtags(input, guidelines) {
  const explicitlyRequested =
    Array.isArray(input?.hashtags) && input.hashtags.some((hashtag) => String(hashtag).trim())

  return (
    explicitlyRequested ||
    hasIdentifiableCampaign(input) ||
    activeGuidelinesRequireHashtags(guidelines)
  )
}

function removeUnrequestedHashtags(text) {
  if (!text) return text

  return text
    .replace(HASHTAG_PATTERN, '$1')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/**
 * Deterministic post-processing of a model-produced generation result:
 * - one shared caption cloned across every requested platform for compatibility
 * - assumptions/missingInformation always arrays
 * - approval-claim phrases flagged for human review (never silently rewritten)
 * - event-oriented content: unprovided event details surfaced in missingInformation
 * - X drafts over the character limit flagged
 * - humanReviewRequired always true
 *
 * Pure function — returns a schema-valid AiGenerationResult.
 */
export function applyGenerationGuardrails(result, input, { allowHashtags = false } = {}) {
  const legacyDrafts = Array.isArray(result?.drafts) ? result.drafts : []
  const sharedCaption = result?.caption || legacyDrafts[0]

  const missingEventDetails = isEventContentType(input.contentType)
    ? EVENT_DETAIL_CHECKS.filter((check) => {
        const value = input.eventDetails?.[check.field]
        return !(typeof value === 'string' && value.trim())
      })
    : []
  const missingCta =
    isEventContentType(input.contentType) &&
    contentTypeRequiresEventCta(input.contentType) &&
    !input.cta

  const existing = sharedCaption || {
    contentType: input.contentType,
    draftText: 'Generación no disponible. Completa este borrador manualmente.',
    rationale: 'No se generó el caption compartido.',
    assumptions: [],
    missingInformation: ['Caption ausente; completar manualmente.'],
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

  if ((existing.draftText?.length || 0) > X_MAX_CHARS) {
    missingInformation.push(
      `El caption compartido excede el límite de ${X_MAX_CHARS} caracteres de X (${existing.draftText.length}); acortar antes de publicar.`
    )
  }

  const normalizedCaption = {
    ...existing,
    contentType: input.contentType,
    draftText: allowHashtags ? existing.draftText : removeUnrequestedHashtags(existing.draftText),
    assumptions,
    missingInformation,
    imagePrompt: existing.imagePrompt,
    imageRationale: existing.imageRationale,
  }
  delete normalizedCaption.platform
  const drafts = input.platforms.map((platform) => ({ ...normalizedCaption, platform }))

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
    }
  }

  return { ok: true, value: parsed.data }
}

async function loadGuidelinesStep(input) {
  'use step'
  const active = await getActiveGuidelines()
  const byPlatform = {}
  for (const platform of input.platforms) {
    byPlatform[platform] = resolveGenerationGuidelinesFromDocument(active, {
      platform,
      contentType: input.contentType,
    })
  }

  return {
    version: active?.version || 'mvp-default-v1',
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
  const allowHashtags = shouldIncludeHashtags(input, guidelines)
  const needsPosterText =
    isEventContentType(input.contentType) && Boolean(resolveTemplateLayoutId(input.contentType))

  const platformSections = input.platforms
    .map((platform) => {
      const rules = guidelines.platforms[platform]?.platform || 'Reglas generales de plataforma.'
      return `- ${platform}: ${rules}`
    })
    .join('\n')

  const systemPrompt = `Eres un generador de captions para redes sociales de SAC (Sociedad de Astronomía del Caribe).
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "caption": {
    "contentType": string,
    "draftText": string (español, máximo 280 caracteres incluyendo hashtags y enlaces),
    "rationale": string (opcional),
    "assumptions": string[],
    "missingInformation": string[]
  },
  "posterSubtitle": string (solo para afiches de eventos; omitir en otros casos),
  "posterBody": string (solo para afiches de eventos; omitir en otros casos),
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
- Genera UN SOLO caption compartido para X, Instagram y Facebook.
- El mismo texto se publicará sin cambios en las tres redes.
- "draftText" no puede superar 280 caracteres en total, contando espacios, hashtags y enlaces.
- Combina las reglas de las tres plataformas; ante conflicto aplica la regla más restrictiva.
- Usa exactamente el contentType solicitado.
- Idioma: español (por defecto), tono adecuado a SAC / Puerto Rico.
- Hashtags: no incluir ni sugerir por defecto. En esta solicitud están ${
    allowHashtags ? 'permitidos por una excepción aplicable' : 'prohibidos'
  }. Solo se permiten si el usuario los solicitó, hay una campaña identificable o las guías activas los requieren explícitamente.
- Preserva los hechos provistos (knownFacts, eventDetails, enlaces) tal cual, sin alterarlos.
- NO inventes fechas, horarios, lugares, costos, enlaces ni hechos científicos no provistos.
- Si falta información crítica, deja huecos claros en "missingInformation" y NO rellenes con datos inventados.
- Registra en "assumptions" cualquier supuesto tomado; usa [] si no hay.
- NO afirmes aprobación oficial de SAC ni que el contenido está listo para publicar sin revisión humana.
- "recommendedNextStep" debe sugerir validar el borrador antes de aprobar/publicar.
- Para un afiche de evento con plantilla, "posterSubtitle" debe ser un llamado breve, cálido y activo (máximo 80 caracteres) debajo del título. Varía naturalmente la apertura entre invitaciones como venir, acompañarnos, descubrir, disfrutar o mirar juntos; no copies literalmente los ejemplos ni uses siempre el mismo verbo.
- "posterBody" debe ser una sola oración creativa e inspiradora (máximo 140 caracteres) que aparecerá encima de las tarjetas informativas.
- Mantén "posterSubtitle" y "posterBody" independientes del caption. No repitas en ellos el título del evento, la fecha, la hora ni el lugar: esos datos ya aparecen en la plantilla.
- No incluyas hashtags, enlaces, costos ni hechos concretos nuevos en esos dos campos. No inventes información.
- Omite "posterSubtitle" y "posterBody" si no corresponden al tipo de contenido.
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
      content: `Generar un caption compartido y retornar el JSON solicitado.
Input (JSON): ${JSON.stringify(userText)}`,
    },
  ]

  const attempt = async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(OPENROUTER_TEXT_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify({
        ...buildOpenRouterChatBody({
          model,
          messages,
          temperature: 0.4,
          forceJson: true,
        }),
        max_tokens: OPENROUTER_TEXT_MAX_TOKENS,
      }),
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

    const posterText = needsPosterText
      ? {
          subtitle:
            typeof json.posterSubtitle === 'string'
              ? json.posterSubtitle.trim().slice(0, 80)
              : undefined,
          body:
            typeof json.posterBody === 'string' ? json.posterBody.trim().slice(0, 140) : undefined,
        }
      : undefined
    delete json.posterSubtitle
    delete json.posterBody

    // Normalize humanReviewRequired in case the model omitted it
    if (json.humanReviewRequired !== true) {
      json.humanReviewRequired = true
    }

    const validated = AiSharedCaptionResultSchema.parse(json)

    return {
      result: applyGenerationGuardrails(validated, input, { allowHashtags }),
      usage,
      posterText,
    }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return {
      ok: true,
      model,
      result: first.result,
      usage: first.usage,
      posterText: first.posterText,
    }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    try {
      const second = await attempt()
      return {
        ok: true,
        model,
        result: second.result,
        usage: mergeOpenRouterUsage(accumulatedUsage, second.usage),
        posterText: second.posterText,
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

  const backdropOnlyRules =
    input.backgroundMode === 'ai_generated'
      ? `
Reglas adicionales (fondo para plantilla):
- Describe un fondo visual limpio apto para sobreimpresionar texto después.
- SIN texto, SIN logos, SIN captions, SIN tipografía, SIN marcas de agua en la imagen.
- Espacio negativo central amplio para tipografía; atmósfera astronómica / Caribe coherente con SAC.
`
      : ''

  const systemPrompt = `Eres un generador de prompts de imagen para borradores de redes sociales de SAC (Sociedad de Astronomía del Caribe).
SAC publica la MISMA imagen en todas las redes sociales. Genera UN SOLO prompt visual compartido.
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "sharedImagePrompt": string (inglés o español, descripción visual para generador de imágenes),
  "sharedImageRationale": string (español, por qué el prompt apoya los borradores)
}

GUÍAS DE SAC (versión ${guidelines.version}) — cúmplelas al redactar prompts:

[Prompts de imagen]
${firstPlatformGuidelines.imagePrompt || ''}

[Globales]
${firstPlatformGuidelines.global || ''}

[Tipo de contenido]
${firstPlatformGuidelines.contentType || ''}

[Contenido prohibido]
${firstPlatformGuidelines.prohibited || ''}

[Validación de imagen]
${firstPlatformGuidelines.imageValidation || ''}

Reglas:
- Genera UN SOLO imagePrompt compartido para todas las plataformas.
- Alinea el prompt con el tema y los borradores de texto; NO inventes hechos no provistos.
- NO personas identificables, menores, datos privados, logos oficiales ni estilos con copyright.
- NO fechas, horarios, lugares, costos ni enlaces específicos que no estén en los datos provistos.
- Incluye restricciones de seguridad explícitas en el imagePrompt.
- Respeta imageStyle e imageConstraints del usuario cuando estén provistos.
- NO generes assets de imagen; solo el prompt de texto.
${backdropOnlyRules}`

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
      content: `Generar un imagePrompt compartido.
Input (JSON): ${JSON.stringify(userPayload)}`,
    },
  ]

  const attempt = async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(OPENROUTER_TEXT_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify({
        ...buildOpenRouterChatBody({
          model,
          messages,
          temperature: 0.3,
          forceJson: true,
        }),
        max_tokens: OPENROUTER_TEXT_MAX_TOKENS,
      }),
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

    const sharedPrompt = json.sharedImagePrompt || json.imagePrompt
    const sharedRationale = json.sharedImageRationale || json.imageRationale || ''
    if (!sharedPrompt || typeof sharedPrompt !== 'string') {
      const err = new Error('Respuesta sin sharedImagePrompt')
      err.usage = usage
      throw err
    }

    const imagePrompts = input.platforms.map((platform) => ({
      platform,
      imagePrompt: sharedPrompt,
      imageRationale: sharedRationale,
    }))

    const result = mergeImagePromptsIntoResult(textResult, imagePrompts, input)

    return { result, usage }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return {
      ok: true,
      skipped: false,
      result: first.result,
      usage: first.usage,
    }
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

async function generateImageAssetsStep(input, promptResult) {
  'use step'

  if (!shouldGenerateImagePrompt(input.contentType, input)) {
    return { ok: true, skipped: true, result: promptResult, usage: null }
  }

  const draftWithPrompt = promptResult.drafts.find((d) => d.imagePrompt?.trim())
  if (!draftWithPrompt) {
    return { ok: true, skipped: true, result: promptResult, usage: null }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = getImageGenerationConfig().model
  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(OPENROUTER_IMAGE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify({
        ...buildOpenRouterChatBody({
          model,
          messages: [
            {
              role: 'user',
              content: `Genera una sola imagen de borrador para redes sociales de SAC a partir de este prompt. No inventes hechos no incluidos.\n\n${draftWithPrompt.imagePrompt}`,
            },
          ],
          modalities: ['image', 'text'],
        }),
        max_tokens: OPENROUTER_IMAGE_MAX_TOKENS,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${res.status}: ${text}`)
    }

    const data = await res.json()
    const parsedImage = parseOpenRouterImageResponse(data)
    const usage = extractOpenRouterUsage(data, model)

    if (!parsedImage?.dataUrl) {
      throw new Error('Respuesta del provider sin imagen')
    }

    const asset = buildGeneratedImageAsset({
      dataUrl: parsedImage.dataUrl,
      mimeType: parsedImage.mimeType,
      rationale:
        draftWithPrompt.imageRationale ||
        'Borrador visual compartido generado a partir del prompt.',
    })

    return {
      ok: true,
      skipped: false,
      result: AiGenerationResultSchema.parse({
        ...promptResult,
        generatedImage: asset,
        humanReviewRequired: true,
      }),
      usage,
    }
  } catch (err) {
    const updatedDrafts = promptResult.drafts.map((draft) =>
      applyImageAssetFallbackToDraft(draft, err?.message || 'fallo del provider')
    )

    return {
      ok: true,
      skipped: false,
      result: AiGenerationResultSchema.parse({
        ...promptResult,
        drafts: updatedDrafts,
        humanReviewRequired: true,
      }),
      usage: null,
    }
  }
}

/**
 * Generate one shared clean backdrop for template mode (ai_generated).
 * Uses the first draft's imagePrompt; result is attached later via attachTemplateRequestsToResult.
 */
async function generateSharedBackdropStep(input, promptResult) {
  'use step'

  const draftWithPrompt = (promptResult.drafts || []).find((d) => d.imagePrompt?.trim())
  if (!draftWithPrompt) {
    return {
      ok: false,
      skipped: true,
      skippedReason: 'missing_image_prompt',
      backdropDataUrl: null,
      usage: null,
      result: promptResult,
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = getImageGenerationConfig().model
  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  const backdropPrompt = `${draftWithPrompt.imagePrompt}

Clean background only for a social media template overlay. No text, no logos, no captions, no typography baked into the image. Wide open negative space for headline text.`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(OPENROUTER_IMAGE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify({
        ...buildOpenRouterChatBody({
          model,
          messages: [
            {
              role: 'user',
              content: `Genera una sola imagen de fondo limpio para plantilla de redes sociales de SAC.\n\n${backdropPrompt}`,
            },
          ],
          modalities: ['image', 'text'],
        }),
        max_tokens: OPENROUTER_IMAGE_MAX_TOKENS,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${res.status}: ${text}`)
    }

    const data = await res.json()
    const parsedImage = parseOpenRouterImageResponse(data)
    const usage = extractOpenRouterUsage(data, model)

    if (!parsedImage?.dataUrl) {
      throw new Error('Respuesta del provider sin imagen')
    }

    return {
      ok: true,
      skipped: false,
      backdropDataUrl: parsedImage.dataUrl,
      usage,
      result: promptResult,
    }
  } catch (err) {
    const drafts = promptResult.drafts.map((draft) =>
      applyImageAssetFallbackToDraft(draft, err?.message || 'fallo del provider (fondo)')
    )
    return {
      ok: false,
      skipped: false,
      backdropDataUrl: null,
      usage: null,
      result: AiGenerationResultSchema.parse({
        ...promptResult,
        drafts,
        humanReviewRequired: true,
      }),
    }
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
    throw new Error('La solicitud de generación no es válida.')
  }

  const validatedInput = validatedInputResult.value
  const guidelines = await loadGuidelinesStep(validatedInput)
  const textResult = await generateTextStep(validatedInput, guidelines)
  if (!textResult.ok) {
    console.error('generateAiWorkflow: text provider failed', textResult.reason)
    if (runId) {
      await persistGenerationHistoryStep({
        input: validatedInput,
        runId,
        status: 'failed',
        error: { message: 'provider_generation_failed', retryable: true },
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: guidelines.version,
        usage: textResult.usage,
      })
    }
    throw new Error('No se pudieron generar los borradores. Intenta nuevamente.')
  }

  const usesTemplate =
    (validatedInput.backgroundMode === 'stock' ||
      validatedInput.backgroundMode === 'ai_generated') &&
    Boolean(resolveTemplateLayoutId(validatedInput.contentType))

  let finalResult
  let usage

  if (usesTemplate && validatedInput.backgroundMode === 'stock') {
    if (!getBackgroundById(validatedInput.backgroundId)) {
      const drafts = textResult.result.drafts.map((draft) => ({
        ...draft,
        missingInformation: [
          ...(Array.isArray(draft.missingInformation) ? draft.missingInformation : []),
          'Fondo de plantilla inválido o no seleccionado.',
        ],
      }))
      finalResult = AiGenerationResultSchema.parse({
        ...textResult.result,
        drafts,
        humanReviewRequired: true,
      })
      usage = textResult.usage
    } else {
      usage = textResult.usage
      finalResult = AiGenerationResultSchema.parse(
        attachTemplateRequestsToResult(textResult.result, validatedInput, {
          posterText: textResult.posterText,
        })
      )
    }
  } else if (usesTemplate && validatedInput.backgroundMode === 'ai_generated') {
    const imagePromptResult = await generateImagePromptsStep(
      validatedInput,
      textResult.result,
      guidelines
    )
    const usageAfterPrompts = mergeOpenRouterUsage(textResult.usage, imagePromptResult.usage)
    const backdropResult = await generateSharedBackdropStep(
      validatedInput,
      imagePromptResult.result
    )
    usage = mergeOpenRouterUsage(usageAfterPrompts, backdropResult.usage)

    if (backdropResult.backdropDataUrl) {
      finalResult = AiGenerationResultSchema.parse(
        attachTemplateRequestsToResult(backdropResult.result, validatedInput, {
          backdropDataUrl: backdropResult.backdropDataUrl,
          posterText: textResult.posterText,
        })
      )
    } else {
      finalResult = backdropResult.result
    }
  } else {
    const imagePromptResult = await generateImagePromptsStep(
      validatedInput,
      textResult.result,
      guidelines
    )
    const usageAfterPrompts = mergeOpenRouterUsage(textResult.usage, imagePromptResult.usage)
    const imageAssetResult = await generateImageAssetsStep(validatedInput, imagePromptResult.result)
    usage = mergeOpenRouterUsage(usageAfterPrompts, imageAssetResult.usage)
    finalResult = imageAssetResult.result
  }

  const completedAt = new Date().toISOString()

  if (runId) {
    await persistGenerationHistoryStep({
      input: validatedInput,
      runId,
      status: 'completed',
      result: finalResult,
      startedAt,
      completedAt,
      guidelineVersion: guidelines.version,
      usage,
    })
  }

  return {
    result: finalResult,
    usage,
    guidelineVersion: guidelines.version,
  }
}
