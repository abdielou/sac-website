import { fetch, getWorkflowMetadata } from 'workflow'
import { z } from 'zod'
import {
  AI_AGENT_IDENTITY_PROMPT,
  AI_BASE_POLICY_VERSION,
  BASE_POLICY_REQUEST_CATEGORIES,
  buildAgentSystemPrompt,
  formatUntrustedGuidelines,
  formatUntrustedRequest,
} from '../../../lib/ai-agent'
import { classifyAiPolicyRequest, reviewAiPolicyResult } from '../../../lib/ai-policy-review'
import {
  GENERATION_INPUT_LIMITS,
  MAX_GUIDELINE_PLATFORMS,
  PLATFORM_ID_PATTERN,
  contentTypeAcceptsImages,
  contentTypeRequiresImages,
  contentTypeRequiresEventCta,
  getCanonicalEventName,
  isEventContentType,
  shouldGenerateImagePrompt,
} from '../../../lib/ai-constants'
import { contentDataToLegacyInput, validateContentData } from '../../../lib/ai-content-data'
import { resolveImageTextPolicy, stripNoTextInstructions } from '../../../lib/ai-image-text-policy'
import { resolveGenerationGuidelinesFromDocument } from '../../../lib/ai-guidelines'
import { getGuidelineVersion } from '../../../lib/guidelines-store'
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
import { renderSocialTemplateImage } from '../../../lib/social-template/renderSocialTemplateImage'
import {
  markGeneratedImageAssetPrepared,
  normalizeGeneratedImageAsset,
} from '../../../lib/social-template/prepareGeneratedImageAsset'

const OPENROUTER_TEXT_TIMEOUT_MS = 30_000
const OPENROUTER_IMAGE_TIMEOUT_MS = 60_000
const OPENROUTER_TEXT_MAX_TOKENS = 2_000
const OPENROUTER_IMAGE_MAX_TOKENS = 2_048
const GUIDELINE_NONCOMPLIANCE_CATEGORY = 'guideline_noncompliance'

// ---------- Generation schemas (Phase 2A text; Phase 2D prompts; Phase 2E assets) ----------

const MAX_SPONSOR_DATA_URL_LENGTH = Math.ceil((SPONSOR_MAX_BYTES * 4) / 3) + 128
const MAX_PLATFORM_INPUTS = MAX_GUIDELINE_PLATFORMS

const boundedRequiredString = (max) => z.string().trim().min(1).max(max)
const boundedOptionalString = (max) => boundedRequiredString(max).optional()
const ContentTypeIdSchema = boundedRequiredString(64).regex(
  /^[a-z][a-z0-9_]{1,63}$/,
  'Identificador de tipo de contenido inválido'
)
const PlatformIdSchema = boundedRequiredString(64).regex(
  PLATFORM_ID_PATTERN,
  'Identificador de plataforma inválido'
)
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
    preparedForDisplay: z.literal(true).optional(),
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
    downloadFileName: boundedOptionalString(255),
    sponsorLogo: AiSponsorLogoSchema.optional(),
  })
  .strict()

export const AiDraftVariantSchema = z
  .object({
    platform: PlatformIdSchema,
    contentType: ContentTypeIdSchema,
    draftText: boundedRequiredString(20_000),
    rationale: boundedOptionalString(4000),
    assumptions: z.array(boundedRequiredString(2000)).max(50).optional(),
    missingInformation: z.array(boundedRequiredString(2000)).max(50).optional(),
    imagePrompt: boundedOptionalString(20_000),
    imageRationale: boundedOptionalString(4000),
  })
  .strict()

const AiPolicyReviewSchema = z
  .object({
    stage: z.enum(['caption', 'result']),
    disposition: z.enum(['block', 'review']),
    categories: z.array(boundedRequiredString(100)).min(1).max(20),
    reason: boundedRequiredString(1000),
    failClosed: z.boolean(),
  })
  .strict()

export const AiSharedCaptionResultSchema = z
  .object({
    caption: z
      .object({
        contentType: ContentTypeIdSchema,
        draftText: boundedRequiredString(20_000),
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
    platform: PlatformIdSchema,
    imagePrompt: boundedRequiredString(20_000),
    imageRationale: boundedOptionalString(4000),
  })
  .strict()

export const AiImagePromptsResultSchema = z
  .object({
    imagePrompts: z.array(AiImagePromptEntrySchema).min(1).max(MAX_GUIDELINE_PLATFORMS),
  })
  .strict()

export const AiGenerationResultSchema = z
  .object({
    drafts: z.array(AiDraftVariantSchema).min(1).max(MAX_GUIDELINE_PLATFORMS),
    recommendedNextStep: boundedRequiredString(4000),
    humanReviewRequired: z.literal(true),
    captionCharacterLimit: z.number().int().min(1).max(20_000).optional(),
    generatedImage: AiGeneratedImageSchema.optional(),
    imagePlatforms: z.array(PlatformIdSchema).min(1).max(MAX_GUIDELINE_PLATFORMS).optional(),
    templateRequest: AiTemplateRequestSchema.optional(),
    templateAssets: AiTemplateAssetsSchema.optional(),
    policyReview: AiPolicyReviewSchema.optional(),
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
    name: boundedOptionalString(GENERATION_INPUT_LIMITS.eventName),
    date: EventDateSchema.optional(),
    time: EventTimeSchema.optional(),
    location: boundedOptionalString(GENERATION_INPUT_LIMITS.eventLocation),
  })
  .strict()

const NormalizedPlatformsSchema = z
  .array(PlatformIdSchema)
  .min(1)
  .max(MAX_PLATFORM_INPUTS)
  .transform((platforms) => [...new Set(platforms)])
  .refine((platforms) => platforms.length <= MAX_GUIDELINE_PLATFORMS, {
    message: `Máximo ${MAX_GUIDELINE_PLATFORMS} plataformas`,
  })

const ContentTypeDefinitionSchema = z
  .object({
    id: ContentTypeIdSchema,
    label: z.string().trim().min(1),
    status: z.literal('active'),
    fields: z.array(z.record(z.any())).min(1).max(30),
    visual: z.record(z.any()),
  })
  .passthrough()

const ContentTypeIdentitySchema = z
  .object({
    id: ContentTypeIdSchema,
    label: z.string().trim().min(1),
    guidelineVersion: boundedRequiredString(100),
  })
  .strict()

export const GenerateInputSchema = z
  .object({
    userId: boundedRequiredString(256),
    userEmail: z.string().trim().email().max(254),
    intent: boundedOptionalString(GENERATION_INPUT_LIMITS.intent),
    topic: boundedOptionalString(GENERATION_INPUT_LIMITS.topic),
    platforms: NormalizedPlatformsSchema,
    contentType: ContentTypeIdSchema,
    contentData: z.record(z.any()),
    contentTypeDefinition: ContentTypeDefinitionSchema,
    contentTypeIdentity: ContentTypeIdentitySchema,
    guidelineVersion: boundedRequiredString(100),
    policyVersion: boundedRequiredString(100),
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
    const definition = value.contentTypeDefinition

    if (definition.id !== value.contentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La definición no corresponde al tipo de contenido solicitado',
        path: ['contentTypeDefinition', 'id'],
      })
    }
    if (
      value.contentTypeIdentity.id !== value.contentType ||
      value.contentTypeIdentity.label !== definition.label ||
      value.contentTypeIdentity.guidelineVersion !== value.guidelineVersion
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La identidad del tipo de contenido no coincide con la versión fijada',
        path: ['contentTypeIdentity'],
      })
    }
    if (value.policyVersion !== AI_BASE_POLICY_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La versión de la política base no coincide con la versión vigente',
        path: ['policyVersion'],
      })
    }

    const contentDataValidation = validateContentData(value.contentData, definition)
    for (const message of contentDataValidation.errors) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['contentData'],
      })
    }

    if (isEventContentType(value.contentType, definition)) {
      if (!value.eventDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `eventDetails es obligatorio para ${value.contentType}`,
          path: ['eventDetails'],
        })
      }
      if (!value.cta && contentTypeRequiresEventCta(value.contentType, definition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `cta es obligatorio para ${value.contentType}`,
          path: ['cta'],
        })
      }
    }

    const canonicalEventName = getCanonicalEventName(value.contentType, definition)
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

    const supportsImageForPlatforms = shouldGenerateImagePrompt(
      value.contentType,
      value,
      definition
    )
    const templateLayout = resolveTemplateLayoutId(value.contentType, definition)
    if (templateLayout && supportsImageForPlatforms && !value.backgroundMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'backgroundMode es obligatorio para tipos con plantilla visual',
        path: ['backgroundMode'],
      })
    }

    if (value.backgroundMode && !templateLayout) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El tipo de contenido no admite plantilla visual',
        path: ['backgroundMode'],
      })
    }

    if (!supportsImageForPlatforms && value.backgroundMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las plataformas seleccionadas prohíben imágenes para este tipo de contenido',
        path: ['backgroundMode'],
      })
    }

    if (
      value.backgroundMode &&
      !definition.visual?.backgroundSources?.includes(value.backgroundMode)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La fuente de fondo no está permitida para este tipo de contenido',
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
      if (definition.visual?.sponsorAllowed !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sponsorLogo no está permitido para este tipo de contenido',
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

const HASHTAG_PATTERN = /(^|\s)#[\p{L}\p{N}_-]+/gu
const CAMPAIGN_PATTERN = /\b(?:campa(?:ñ|n)a|campaign)\b/i
const REQUIRED_HASHTAG_PATTERN =
  /(?:requier\w*|obligatori\w*|debe[n]?\s+incluir|incluir\s+obligatoriamente)[^\n.]{0,80}hashtags?|hashtags?[^\n.]{0,80}(?:requerid\w*|obligatori\w*)/i
const COST_FACT_PATTERN =
  /\b(?:costo|coste|precio|tarifa|donativo|entrada\s+libre|libre\s+de\s+costo|sin\s+costo|gratis|gratuit[oa]s?)\b/iu
const UNSUPPORTED_FREE_ADMISSION_PATTERNS = [
  /\b(?:este\s+|el\s+|un\s+)?(?:evento|actividad)\s+(?:es\s+|ser[aá]\s+)?(?:totalmente\s+|completamente\s+)?(?:libre\s+de\s+costo|sin\s+costo|gratuit[oa])(?:\s+para\s+(?:toda\s+)?(?:la\s+)?(?:familia|comunidad|p[uú]blico))?/giu,
  /\b(?:la\s+)?(?:entrada|admisi[oó]n)\s+(?:es\s+|ser[aá]\s+)?(?:totalmente\s+|completamente\s+)?(?:libre|libre\s+de\s+costo|sin\s+costo|gratuit[oa])(?:\s+para\s+(?:toda\s+)?(?:la\s+)?(?:familia|comunidad|p[uú]blico))?/giu,
  /\b(?:de\s+forma\s+)?gratuit[oa](?:mente)?\b/giu,
  /\b(?:libre\s+de\s+costo|sin\s+costo|gratis)\b/giu,
]

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

function inputSuppliesCostInformation(input) {
  const supplied = [
    input?.intent,
    input?.topic,
    input?.cta,
    ...(Array.isArray(input?.knownFacts) ? input.knownFacts : []),
    ...(Array.isArray(input?.links) ? input.links : []),
    ...Object.values(input?.eventDetails || {}),
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')

  return COST_FACT_PATTERN.test(supplied)
}

function removeUnsupportedFreeAdmissionClaims(text, input) {
  if (!text || inputSuppliesCostInformation(input)) return text

  return UNSUPPORTED_FREE_ADMISSION_PATTERNS.reduce(
    (caption, pattern) => caption.replace(pattern, ''),
    text
  )
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([.!?])\s*[.!?]+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\s*[,;:.!?]+\s*/g, '')
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
export function resolveSharedCaptionCharacterLimit(guidelines, platforms = []) {
  const limits = platforms
    .map((platform) => guidelines?.platforms?.[platform]?.captionMaxCharacters)
    .filter((value) => Number.isInteger(value) && value > 0)
  return limits.length ? Math.min(...limits) : null
}

export function applyGenerationGuardrails(
  result,
  input,
  { allowHashtags = false, captionMaxCharacters = null } = {}
) {
  const legacyDrafts = Array.isArray(result?.drafts) ? result.drafts : []
  const sharedCaption = result?.caption || legacyDrafts[0]

  const definition = input.contentTypeDefinition
  const requiredEventFields = definition
    ? new Set(
        definition.fields
          .filter(({ required }) => required)
          .map(({ key }) => (key === 'event_name' ? 'name' : key))
      )
    : null
  const missingEventDetails = isEventContentType(input.contentType, definition)
    ? EVENT_DETAIL_CHECKS.filter((check) => {
        if (requiredEventFields && !requiredEventFields.has(check.field)) return false
        const value = input.eventDetails?.[check.field]
        return !(typeof value === 'string' && value.trim())
      })
    : []
  const missingCta =
    isEventContentType(input.contentType, definition) &&
    contentTypeRequiresEventCta(input.contentType, definition) &&
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

  if (
    Number.isInteger(captionMaxCharacters) &&
    captionMaxCharacters > 0 &&
    (existing.draftText?.length || 0) > captionMaxCharacters
  ) {
    missingInformation.push(
      `El caption compartido excede el límite aplicable de ${captionMaxCharacters} caracteres (${existing.draftText.length}); acortar antes de publicar.`
    )
  }

  const normalizedCaption = {
    ...existing,
    contentType: input.contentType,
    draftText: removeUnsupportedFreeAdmissionClaims(
      allowHashtags ? existing.draftText : removeUnrequestedHashtags(existing.draftText),
      input
    ),
    assumptions,
    missingInformation,
    imagePrompt: existing.imagePrompt,
    imageRationale: existing.imageRationale,
  }
  delete normalizedCaption.platform
  const drafts = input.platforms.map((platform) => ({ ...normalizedCaption, platform }))

  return AiGenerationResultSchema.parse({
    drafts,
    ...(Number.isInteger(captionMaxCharacters) && captionMaxCharacters > 0
      ? { captionCharacterLimit: captionMaxCharacters }
      : null),
    recommendedNextStep:
      result?.recommendedNextStep ||
      'Validar los borradores generados antes de aprobar o publicar.',
    humanReviewRequired: true,
  })
}

// ---------- Image prompt guardrails (Phase 2D) ----------

const DEFAULT_IMAGE_SAFETY_SUFFIX =
  'No identifiable faces, no private information, no official logos, no copyrighted art styles. If a child is relevant to the theme, show them non-identifiably, fully clothed, and only in an ordinary family-safe context.'
const CHILD_CONTEXT_SAFETY_SUFFIX =
  'Show any child non-identifiably, fully clothed, and only in an ordinary family-safe context.'
const DEFAULT_IMAGE_TEXT_PREFERENCE = 'No unrequested text overlay.'
const CHILD_REFERENCE_PATTERN = /\b(?:child|children|minor|niñ[oa]s?|menor(?:es)?)\b/i

const IMAGE_PROMPT_RISK_PATTERNS = [
  {
    pattern: /\b(?:portrait|retrato)\s+of\b/i,
    message: 'El prompt de imagen sugiere retrato identificable; revisar antes de generar.',
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

function usesTemplateTextOverlay(input) {
  return (
    Boolean(resolveTemplateLayoutId(input.contentType, input.contentTypeDefinition)) &&
    (input.backgroundMode === 'stock' || input.backgroundMode === 'ai_generated')
  )
}

function buildRequiredImageTextSuffix(textPolicy) {
  const requiredCopy = textPolicy.suggestedText
    ? `Required on-image text: "${textPolicy.suggestedText}".`
    : 'Include the greeting or message required by the content-type rule, derived only from the supplied topic and caption.'
  return `${requiredCopy} Render it as clearly legible, high-contrast typography with an intentional social-poster hierarchy. Keep the visual subject aligned with the publication topic, occasion, and caption, and follow every active Guidelines visual restriction. Do not add unsupported dates, places, costs, links, or institutional claims.`
}

function ensureImagePromptSafetySuffix(imagePrompt, input) {
  if (!imagePrompt?.trim()) return imagePrompt
  const textPolicy = resolveImageTextPolicy(input, input.contentTypeDefinition?.generation?.rules)
  const renderRequiredText = textPolicy.required && !usesTemplateTextOverlay(input)
  let normalizedPrompt = renderRequiredText
    ? stripNoTextInstructions(imagePrompt)
    : imagePrompt.trim()

  if (!imagePromptHasSafetyConstraints(normalizedPrompt)) {
    normalizedPrompt = `${normalizedPrompt}; ${DEFAULT_IMAGE_SAFETY_SUFFIX}`
  }
  if (CHILD_REFERENCE_PATTERN.test(normalizedPrompt) && !/fully clothed/i.test(normalizedPrompt)) {
    normalizedPrompt = `${normalizedPrompt}; ${CHILD_CONTEXT_SAFETY_SUFFIX}`
  }

  const textInstruction = renderRequiredText
    ? buildRequiredImageTextSuffix(textPolicy)
    : DEFAULT_IMAGE_TEXT_PREFERENCE
  return `${normalizedPrompt}; ${textInstruction}`
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

  imagePrompt = ensureImagePromptSafetySuffix(imagePrompt, input)

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

function applyPlatformImagePolicyToDraft(draft, input) {
  if (contentTypeAcceptsImages(draft.platform, input.contentType, input.contentTypeDefinition)) {
    return draft
  }
  const { imagePrompt: _imagePrompt, imageRationale: _imageRationale, ...textOnlyDraft } = draft
  return textOnlyDraft
}

/**
 * Merge image prompts into text drafts and apply image prompt guardrails.
 */
export function mergeImagePromptsIntoResult(textResult, imagePrompts, input) {
  const byPlatform = new Map(
    (Array.isArray(imagePrompts) ? imagePrompts : []).map((entry) => [entry.platform, entry])
  )

  const drafts = textResult.drafts.map((draft) => {
    const allowedDraft = applyPlatformImagePolicyToDraft(draft, input)
    if (allowedDraft !== draft) return allowedDraft
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

function resolveImagePlatforms(input) {
  return input.platforms.filter((platform) =>
    contentTypeAcceptsImages(platform, input.contentType, input.contentTypeDefinition)
  )
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
  try {
    const document = await getGuidelineVersion(input.guidelineVersion)
    if (!document || document.version !== input.guidelineVersion) {
      return { ok: false, reason: 'guideline_version_unavailable' }
    }
    if (
      input.platforms.some(
        (platform) => !Object.prototype.hasOwnProperty.call(document.platforms || {}, platform)
      )
    ) {
      return { ok: false, reason: 'platform_unavailable' }
    }

    const byPlatform = {}
    for (const platform of input.platforms) {
      byPlatform[platform] = resolveGenerationGuidelinesFromDocument(document, {
        platform,
        contentType: input.contentType,
      })
    }

    const resolved = byPlatform[input.platforms[0]]
    const definition = resolved?.contentTypeDefinition
    if (!definition || definition.status !== 'active') {
      return { ok: false, reason: 'content_type_unavailable' }
    }
    if (
      input.policyVersion !== AI_BASE_POLICY_VERSION ||
      input.contentTypeIdentity?.id !== definition.id ||
      input.contentTypeIdentity?.label !== definition.label ||
      input.contentTypeIdentity?.guidelineVersion !== document.version
    ) {
      return { ok: false, reason: 'pinned_identity_mismatch' }
    }

    const exactInputResult = GenerateInputSchema.safeParse({
      ...input,
      contentTypeDefinition: definition,
      contentTypeIdentity: resolved.contentTypeIdentity,
    })
    if (!exactInputResult.success) {
      return { ok: false, reason: 'pinned_definition_mismatch' }
    }
    const normalizedLegacyInput = contentDataToLegacyInput(
      exactInputResult.data.contentData,
      definition
    )

    return {
      ok: true,
      version: document.version,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeDefinition: definition,
      contentTypeIdentity: resolved.contentTypeIdentity,
      input: {
        ...exactInputResult.data,
        ...normalizedLegacyInput,
        contentTypeDefinition: definition,
        contentTypeIdentity: resolved.contentTypeIdentity,
      },
      platforms: byPlatform,
    }
  } catch (error) {
    console.error('generateAiWorkflow: failed to load pinned guidelines', error)
    return { ok: false, reason: 'guideline_version_unavailable' }
  }
}

function buildPolicyRequest(input) {
  return {
    contentType: input.contentType,
    contentData: input.contentData,
    platforms: input.platforms,
    intent: input.intent,
    topic: input.topic,
    tone: input.tone,
    audience: input.audience,
    cta: input.cta,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    hashtags: input.hashtags,
    links: input.links,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    backgroundMode: input.backgroundMode,
  }
}

function buildPolicyGuidelines(guidelines) {
  const first = guidelines.platforms?.[Object.keys(guidelines.platforms)[0]] || {}
  return {
    version: guidelines.version,
    global: first.global,
    platforms: Object.fromEntries(
      Object.entries(guidelines.platforms || {}).map(([platform, value]) => [
        platform,
        value.platform,
      ])
    ),
    contentType: first.contentType,
    prohibited: first.prohibited,
    imagePrompt: first.imagePrompt,
    imageValidation: first.imageValidation,
    contentTypeDefinition: guidelines.contentTypeDefinition,
  }
}

function buildTextPromptGuidelines(guidelines, platforms) {
  const first = guidelines.platforms?.[platforms[0]] || {}
  return {
    version: guidelines.version,
    global: first.global,
    platforms: Object.fromEntries(
      platforms.map((platform) => [
        platform,
        guidelines.platforms?.[platform]?.platform || 'Reglas generales de plataforma.',
      ])
    ),
    platformConstraints: Object.fromEntries(
      platforms.map((platform) => [
        platform,
        {
          captionMaxCharacters: guidelines.platforms?.[platform]?.captionMaxCharacters ?? null,
        },
      ])
    ),
    contentType: first.contentType,
    prohibited: first.prohibited,
  }
}

function buildImagePromptGuidelines(guidelines, platforms) {
  const first = guidelines.platforms?.[platforms[0]] || {}
  return {
    version: guidelines.version,
    imagePrompt: first.imagePrompt,
    global: first.global,
    platforms: Object.fromEntries(
      platforms.map((platform) => [
        platform,
        guidelines.platforms?.[platform]?.platform || 'Expectativas generales de plataforma.',
      ])
    ),
    contentType: first.contentType,
    prohibited: first.prohibited,
    imageValidation: first.imageValidation,
  }
}

async function classifyPolicyRequestStep(input, guidelines) {
  'use step'
  const images = input.sponsorLogo?.dataUrl ? [input.sponsorLogo.dataUrl] : []
  return classifyAiPolicyRequest(
    {
      request: buildPolicyRequest(input),
      guidelines: buildPolicyGuidelines(guidelines),
      images,
    },
    { fetchImpl: fetch }
  )
}

async function reviewPolicyResultStep(input, guidelines, result) {
  'use step'
  const images = []

  if (result.generatedImage?.dataUrl) {
    images.push(result.generatedImage.dataUrl)
  }

  return reviewAiPolicyResult(
    {
      request: buildPolicyRequest(input),
      result: { ...result, policyContext: buildPolicyReviewContext(input) },
      guidelines: buildPolicyGuidelines(guidelines),
      images,
    },
    { fetchImpl: fetch }
  )
}

function buildPolicyReviewContext(input) {
  const imageTextPolicy = resolveImageTextPolicy(
    input,
    input.contentTypeDefinition?.generation?.rules
  )
  return {
    currentDate: new Date().toISOString().slice(0, 10),
    suppliedLogistics: {
      eventDetails: input.eventDetails,
      cta: input.cta,
      links: input.links,
      sponsorProvided: Boolean(input.sponsorLogo?.dataUrl),
    },
    posterCreativeText:
      'El subtítulo y cuerpo del afiche son redacción creativa, no datos logísticos. Solo son afirmaciones factuales si añaden fecha, hora, lugar, costo, enlace, auspiciador, instrucciones concretas o datos científicos.',
    imageTextRequirement: {
      required: imageTextPolicy.required,
      suggestedText: imageTextPolicy.suggestedText,
      guidance:
        'Omitir texto, saludo, branding, estilo o layout requerido es un incumplimiento de Guidelines, no una imagen no relacionada cuando la escena sí corresponde al tema.',
    },
  }
}

async function reviewCaptionPolicyStep(input, guidelines, textResult, posterText) {
  'use step'
  return reviewAiPolicyResult(
    {
      request: buildPolicyRequest(input),
      result: {
        ...textResult,
        ...(posterText ? { posterCreativeText: posterText } : null),
        policyContext: buildPolicyReviewContext(input),
      },
      guidelines: buildPolicyGuidelines(guidelines),
      images: [],
    },
    { fetchImpl: fetch }
  )
}

const HARD_POLICY_CATEGORIES = new Set([
  BASE_POLICY_REQUEST_CATEGORIES.MEDICAL_ADVICE,
  BASE_POLICY_REQUEST_CATEGORIES.LEGAL_ADVICE,
  BASE_POLICY_REQUEST_CATEGORIES.SEXUAL_CONTENT,
  BASE_POLICY_REQUEST_CATEGORIES.DOUBLE_ENTENDRE,
  BASE_POLICY_REQUEST_CATEGORIES.DECEPTIVE_CONTENT,
  BASE_POLICY_REQUEST_CATEGORIES.OUT_OF_SCOPE,
  BASE_POLICY_REQUEST_CATEGORIES.UNRELATED_IMAGE,
  BASE_POLICY_REQUEST_CATEGORIES.DIRECT_PUBLISHING,
  BASE_POLICY_REQUEST_CATEGORIES.BYPASS_HUMAN_REVIEW,
])

function resolvePolicyDisposition(decision) {
  if (decision.failClosed === true) return 'review'
  return decision.categories.some((category) => HARD_POLICY_CATEGORIES.has(category))
    ? 'block'
    : 'review'
}

function attachPolicyReview(result, decision, stage) {
  const disposition = resolvePolicyDisposition(decision)
  const hasGuidelineNoncompliance = decision.categories.includes(GUIDELINE_NONCOMPLIANCE_CATEGORY)
  const removeVisual = stage === 'caption' || disposition === 'block'
  const safeResult = removeVisual
    ? (({
        generatedImage: _generatedImage,
        imagePlatforms: _imagePlatforms,
        templateRequest: _templateRequest,
        templateAssets: _templateAssets,
        ...textResult
      }) => textResult)(result)
    : result
  return AiGenerationResultSchema.parse({
    ...safeResult,
    drafts: removeVisual
      ? safeResult.drafts.map(
          ({ imagePrompt: _prompt, imageRationale: _rationale, ...draft }) => draft
        )
      : safeResult.drafts,
    policyReview: {
      stage,
      disposition,
      categories: decision.categories,
      reason: decision.reason,
      failClosed: decision.failClosed === true,
    },
    recommendedNextStep:
      disposition === 'block'
        ? 'Corrige la solicitud o los datos provistos antes de volver a generar.'
        : hasGuidelineNoncompliance
          ? 'Corrige el incumplimiento indicado o vuelve a generar; el borrador se conserva para revisión.'
          : 'Revisa el motivo, confirma los hechos con la información oficial y decide si conservas o corriges el borrador.',
    humanReviewRequired: true,
  })
}

async function prepareFinalImageStep(input, result) {
  'use step'

  const imagePlatforms = resolveImagePlatforms(input)
  result = AiGenerationResultSchema.parse({
    ...result,
    drafts: result.drafts.map((draft) => applyPlatformImagePolicyToDraft(draft, input)),
  })
  if (!result.generatedImage && !result.templateRequest) return { ok: true, result }

  try {
    let generatedImage
    if (result.templateRequest) {
      if (!result.templateAssets?.backgroundSource) {
        throw new Error('faltan los assets compartidos de la plantilla')
      }
      const rendered = await renderSocialTemplateImage({
        templateRequest: {
          ...result.templateRequest,
          backgroundSource: result.templateAssets.backgroundSource,
          ...(result.templateAssets.sponsorLogo
            ? { sponsorLogo: result.templateAssets.sponsorLogo }
            : null),
        },
      })
      generatedImage = markGeneratedImageAssetPrepared(
        buildGeneratedImageAsset({
          dataUrl: rendered.dataUrl,
          mimeType: rendered.mimeType,
          rationale:
            result.templateAssets.backgroundSource.mode === 'stock'
              ? 'Imagen de plantilla con fondo seleccionado.'
              : 'Imagen de plantilla con fondo generado por IA.',
        })
      )
    } else {
      generatedImage = await normalizeGeneratedImageAsset(result.generatedImage)
    }

    return {
      ok: true,
      result: AiGenerationResultSchema.parse({
        ...result,
        generatedImage,
        imagePlatforms,
        humanReviewRequired: true,
      }),
    }
  } catch (error) {
    console.error('generateAiWorkflow: failed to prepare final image', error)
    const {
      generatedImage: _generatedImage,
      templateRequest: _templateRequest,
      templateAssets: _templateAssets,
      imagePlatforms: _imagePlatforms,
      ...textResult
    } = result
    const drafts = textResult.drafts.map((draft) =>
      imagePlatforms.includes(draft.platform)
        ? applyImageAssetFallbackToDraft(
            draft,
            error?.message || 'no se pudo preparar el arte final'
          )
        : draft
    )
    return {
      ok: false,
      result: AiGenerationResultSchema.parse({
        ...textResult,
        drafts,
        humanReviewRequired: true,
      }),
    }
  }
}

async function generateTextStep(input, guidelines) {
  'use step'

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite-image'
  const allowHashtags = shouldIncludeHashtags(input, guidelines)
  const captionMaxCharacters = resolveSharedCaptionCharacterLimit(guidelines, input.platforms)

  if (!apiKey) {
    return {
      ok: false,
      reason: 'Falta OPENROUTER_API_KEY',
      model,
      result: applyGenerationGuardrails(
        buildFallbackGenerationResult(input, 'Falta configuración del provider'),
        input,
        { allowHashtags, captionMaxCharacters }
      ),
      usage: null,
    }
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  const captionLimitSchemaDescription = captionMaxCharacters
    ? `español, máximo ${captionMaxCharacters} caracteres incluyendo hashtags y enlaces`
    : 'español, sin un máximo editorial configurado'
  const captionLimitInstruction = captionMaxCharacters
    ? `- "draftText" no puede superar ${captionMaxCharacters} caracteres en total, contando espacios, hashtags y enlaces.`
    : '- Guidelines no define un máximo de caracteres para este caption compartido.'
  const needsPosterText =
    isEventContentType(input.contentType) && Boolean(resolveTemplateLayoutId(input.contentType))

  const systemPrompt = buildAgentSystemPrompt({
    modeInstructions: `INSTRUCCIONES OPERATIVAS DEL GENERADOR

En modo generación, crea captions para las redes sociales de SAC (Sociedad de Astronomía del Caribe).
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "caption": {
    "contentType": string,
    "draftText": string (${captionLimitSchemaDescription}),
    "rationale": string (opcional),
    "assumptions": string[],
    "missingInformation": string[]
  },
  "posterSubtitle": string (solo para afiches de eventos; omitir en otros casos),
  "posterBody": string (solo para afiches de eventos; omitir en otros casos),
  "recommendedNextStep": string,
  "humanReviewRequired": true
}

Reglas de salida:
- Usa EXACTAMENTE esas claves. "humanReviewRequired" debe ser siempre true.
- Genera UN SOLO caption compartido para las plataformas indicadas en la solicitud.
- El mismo texto se publicará sin cambios en esas plataformas.
${captionLimitInstruction}
- Cumple conjuntamente las reglas de todas las plataformas destinatarias.
- Usa exactamente el contentType solicitado.
- Idioma: español (por defecto), tono adecuado a SAC / Puerto Rico.
- Hashtags: no incluir ni sugerir por defecto. En esta solicitud están ${
      allowHashtags ? 'permitidos por una excepción aplicable' : 'prohibidos'
    }. Solo se permiten si el usuario los solicitó, hay una campaña identificable o las guías activas los requieren explícitamente.
- Preserva los hechos provistos (knownFacts, eventDetails, enlaces) tal cual, sin alterarlos.
- NO inventes fechas, horarios, lugares, costos, enlaces ni hechos científicos no provistos.
- Si la solicitud no dice explícitamente que la entrada es gratis, NO escribas “evento libre de costo”, “entrada libre”, “sin costo”, “gratis” ni expresiones equivalentes.
- Si falta información crítica, deja huecos claros en "missingInformation" y NO rellenes con datos inventados.
- Registra en "assumptions" cualquier supuesto tomado; usa [] si no hay.
- NO afirmes aprobación oficial de SAC ni que el contenido está listo para publicar sin revisión humana.
- "recommendedNextStep" debe sugerir validar el borrador antes de aprobar/publicar.
- Para un afiche de evento con plantilla, "posterSubtitle" debe ser un llamado breve, cálido y activo (máximo 80 caracteres) debajo del título. Varía naturalmente la apertura entre invitaciones como venir, acompañarnos, descubrir, disfrutar o mirar juntos; no copies literalmente los ejemplos ni uses siempre el mismo verbo.
- "posterBody" debe ser una sola oración creativa e inspiradora (máximo 140 caracteres) que aparecerá encima de las tarjetas informativas.
- Mantén "posterSubtitle" y "posterBody" independientes del caption. No repitas en ellos el título del evento, la fecha, la hora ni el lugar: esos datos ya aparecen en la plantilla.
- No incluyas hashtags, enlaces, costos ni hechos concretos nuevos en esos dos campos. No inventes información.
- Omite "posterSubtitle" y "posterBody" si no corresponden al tipo de contenido.
`,
  })

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
      content: `${formatUntrustedGuidelines(buildTextPromptGuidelines(guidelines, input.platforms))}
Generar un caption compartido y retornar el JSON solicitado.
${formatUntrustedRequest(userText)}`,
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
    if (captionMaxCharacters && validated.caption.draftText.length > captionMaxCharacters) {
      throw new Error(
        `El caption generado excede el máximo configurado de ${captionMaxCharacters} caracteres`
      )
    }

    return {
      result: applyGenerationGuardrails(validated, input, {
        allowHashtags,
        captionMaxCharacters,
      }),
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
        result: applyGenerationGuardrails(
          buildFallbackGenerationResult(input, err1?.message || 'Fallo provider/modelo'),
          input,
          { allowHashtags, captionMaxCharacters }
        ),
        usage: accumulatedUsage,
      }
    }
  }
}

async function generateImagePromptsStep(input, textResult, guidelines) {
  'use step'

  if (!shouldGenerateImagePrompt(input.contentType, input, input.contentTypeDefinition)) {
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
  const imagePlatforms = resolveImagePlatforms(input)
  const firstContentTypeRules = guidelines.platforms?.[imagePlatforms[0]]?.contentType || ''
  const imageTextPolicy = resolveImageTextPolicy(input, firstContentTypeRules)
  const templateWillComposeText = imageTextPolicy.required && usesTemplateTextOverlay(input)

  const imageTextRules = imageTextPolicy.required
    ? templateWillComposeText
      ? `
TEXTO EN IMAGEN: LO COMPONE LA PLANTILLA
- La regla específica del tipo exige texto en el arte final.
- Genera únicamente el fondo limpio; la plantilla añadirá la felicitación después.
- No intentes dibujar letras, captions ni logos dentro del fondo.
`
      : `
TEXTO EN IMAGEN: REQUERIDO
- La regla específica del tipo exige una felicitación o mensaje visible y prevalece sobre cualquier preferencia general de "sin texto" incluida en Guidelines o restricciones.
- El imagePrompt debe pedir una pieza gráfica, no una foto decorativa sin texto.
- Debe indicar literalmente el texto principal entre comillas y pedir tipografía clara, legible y de alto contraste.
- Integra el mensaje con una escena relacionada con el tema, la ocasión y el caption. Puede usar motivos culturales, estacionales, comunitarios, humorísticos o simbólicos pertinentes aunque no sean astronómicos. Respeta cualquier limitación visual adicional definida en Guidelines.
${
  imageTextPolicy.suggestedText
    ? `- Texto principal requerido: "${imageTextPolicy.suggestedText}".`
    : '- Deriva el mensaje únicamente del tema y caption provistos; no inventes logística ni afirmaciones institucionales.'
}
`
    : `
TEXTO EN IMAGEN: NO SOLICITADO
- Evita texto superpuesto cuando la regla específica del tipo no lo exige.
`

  const backdropOnlyRules =
    input.backgroundMode === 'ai_generated'
      ? `
Reglas adicionales (fondo para plantilla):
- Describe un fondo visual limpio apto para sobreimpresionar texto después.
- SIN texto, SIN logos, SIN captions, SIN tipografía, SIN marcas de agua en la imagen.
- Espacio negativo central amplio para tipografía; atmósfera coherente con el tema de la publicación y las Guidelines activas.
`
      : ''

  const systemPrompt = buildAgentSystemPrompt({
    modeInstructions: `INSTRUCCIONES OPERATIVAS DE IMAGEN

En modo imagen, crea prompts visuales para borradores de redes sociales de SAC (Sociedad de Astronomía del Caribe).
SAC publica la MISMA imagen en todas las redes sociales. Genera UN SOLO prompt visual compartido.
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "sharedImagePrompt": string (inglés o español, descripción visual para generador de imágenes),
  "sharedImageRationale": string (español, por qué el prompt apoya los borradores)
}

Reglas:
- Genera UN SOLO imagePrompt compartido para las plataformas que admiten imagen.
- Alinea el prompt con el tema y los borradores de texto; NO inventes hechos no provistos.
- NO personas identificables, datos privados, logos oficiales ni estilos con copyright.
- Si el tema requiere una familia o niñez, permite únicamente figuras no identificables, completamente vestidas y en un contexto cotidiano, seguro y pertinente al mensaje.
- NO fechas, horarios, lugares, costos ni enlaces específicos que no estén en los datos provistos.
- Incluye restricciones de seguridad explícitas en el imagePrompt.
- Respeta imageStyle e imageConstraints del usuario cuando estén provistos.
- NO generes assets de imagen; solo el prompt de texto.
${imageTextRules}
${backdropOnlyRules}`,
  })

  const userPayload = {
    intent: input.intent,
    topic: input.topic,
    contentType: input.contentType,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    knownFacts: input.knownFacts,
    eventDetails: input.eventDetails,
    imageTextPolicy: {
      required: imageTextPolicy.required,
      suggestedText: imageTextPolicy.suggestedText,
      renderedByTemplate: templateWillComposeText,
    },
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
      content: `${formatUntrustedGuidelines(buildImagePromptGuidelines(guidelines, imagePlatforms))}
Generar un imagePrompt compartido.
${formatUntrustedRequest(userPayload)}`,
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

    const imagePrompts = imagePlatforms.map((platform) => ({
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

  if (!shouldGenerateImagePrompt(input.contentType, input, input.contentTypeDefinition)) {
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
              role: 'system',
              content: AI_AGENT_IDENTITY_PROMPT,
            },
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
      contentType: input.contentType,
      eventDetails: input.eventDetails,
      topic: input.topic,
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
              role: 'system',
              content: AI_AGENT_IDENTITY_PROMPT,
            },
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
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: input?.contentTypeIdentity,
      })
    }
    throw new Error('La solicitud de generación no es válida.')
  }

  const pinnedInput = validatedInputResult.value
  const guidelines = await loadGuidelinesStep(pinnedInput)
  if (!guidelines.ok) {
    if (runId) {
      await persistGenerationHistoryStep({
        input: pinnedInput,
        runId,
        status: 'failed',
        error: { message: guidelines.reason, retryable: false },
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: pinnedInput.guidelineVersion,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: pinnedInput.contentTypeIdentity,
      })
    }
    throw new Error('La versión de Guidelines fijada para esta ejecución no está disponible.')
  }

  const validatedInput = guidelines.input
  const requestPolicy = await classifyPolicyRequestStep(validatedInput, guidelines)
  if (requestPolicy.decision !== 'allow') {
    const completedAt = new Date().toISOString()
    if (runId) {
      await persistGenerationHistoryStep({
        input: validatedInput,
        runId,
        status: 'failed',
        error: {
          message: requestPolicy.failClosed
            ? 'policy_classification_unavailable'
            : `policy_request_blocked:${requestPolicy.categories.join(',')}`,
          retryable: requestPolicy.failClosed,
        },
        startedAt,
        completedAt,
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        model: requestPolicy.model,
        usage: requestPolicy.usage,
      })
    }
    throw new Error(
      `Solicitud bloqueada por política. Categorías: ${requestPolicy.categories.join(', ')}. Motivo: ${requestPolicy.reason}`
    )
  }

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
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        usage: mergeOpenRouterUsage(requestPolicy.usage, textResult.usage),
      })
    }
    throw new Error('No se pudieron generar los borradores. Intenta nuevamente.')
  }

  const captionPolicy = await reviewCaptionPolicyStep(
    validatedInput,
    guidelines,
    textResult.result,
    textResult.posterText
  )
  let usage = mergeOpenRouterUsage(textResult.usage, captionPolicy.usage)
  if (captionPolicy.decision !== 'allow') {
    const blockedResult = attachPolicyReview(textResult.result, captionPolicy, 'caption')
    usage = mergeOpenRouterUsage(requestPolicy.usage, usage)
    const completedAt = new Date().toISOString()
    if (runId) {
      await persistGenerationHistoryStep({
        input: validatedInput,
        runId,
        status: 'completed',
        result: blockedResult,
        startedAt,
        completedAt,
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        model: captionPolicy.model,
        usage,
      })
    }
    return {
      result: blockedResult,
      usage,
      guidelineVersion: guidelines.version,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeIdentity: guidelines.contentTypeIdentity,
    }
  }

  const usesTemplate =
    shouldGenerateImagePrompt(
      validatedInput.contentType,
      validatedInput,
      validatedInput.contentTypeDefinition
    ) &&
    (validatedInput.backgroundMode === 'stock' ||
      validatedInput.backgroundMode === 'ai_generated') &&
    Boolean(
      resolveTemplateLayoutId(validatedInput.contentType, validatedInput.contentTypeDefinition)
    )

  let finalResult
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
    } else {
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
    const usageAfterPrompts = mergeOpenRouterUsage(usage, imagePromptResult.usage)
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
    const usageAfterPrompts = mergeOpenRouterUsage(usage, imagePromptResult.usage)
    const imageAssetResult = await generateImageAssetsStep(validatedInput, imagePromptResult.result)
    usage = mergeOpenRouterUsage(usageAfterPrompts, imageAssetResult.usage)
    finalResult = imageAssetResult.result
  }

  const preparedImageResult = await prepareFinalImageStep(validatedInput, finalResult)
  finalResult = preparedImageResult.result

  usage = mergeOpenRouterUsage(requestPolicy.usage, usage)
  const requiredImagePlatforms = validatedInput.platforms.filter((platform) =>
    contentTypeRequiresImages(
      platform,
      validatedInput.contentType,
      validatedInput.contentTypeDefinition
    )
  )
  const sponsorMustAppear = Boolean(validatedInput.sponsorLogo?.dataUrl)
  if (
    (requiredImagePlatforms.length > 0 || sponsorMustAppear) &&
    !finalResult.generatedImage?.preparedForDisplay
  ) {
    if (runId) {
      await persistGenerationHistoryStep({
        input: validatedInput,
        runId,
        status: 'failed',
        error: { message: 'required_image_unavailable', retryable: true },
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        usage,
      })
    }
    throw new Error('No se pudo preparar la imagen requerida por Guidelines.')
  }
  if (finalResult.generatedImage?.dataUrl) {
    const resultPolicy = await reviewPolicyResultStep(validatedInput, guidelines, finalResult)
    usage = mergeOpenRouterUsage(usage, resultPolicy.usage)
    if (resultPolicy.decision !== 'allow') {
      finalResult = attachPolicyReview(finalResult, resultPolicy, 'result')
    }
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
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeIdentity: guidelines.contentTypeIdentity,
      usage,
    })
  }

  return {
    result: finalResult,
    usage,
    guidelineVersion: guidelines.version,
    policyVersion: AI_BASE_POLICY_VERSION,
    contentTypeIdentity: guidelines.contentTypeIdentity,
  }
}
