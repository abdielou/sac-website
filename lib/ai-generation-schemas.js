import { z } from 'zod'
import { AI_BASE_POLICY_VERSION } from './ai-agent'
import {
  GENERATION_INPUT_LIMITS,
  MAX_GUIDELINE_PLATFORMS,
  PLATFORM_ID_PATTERN,
  contentTypeRequiresEventCta,
  getCanonicalEventName,
  isEventContentType,
  shouldGenerateImagePrompt,
} from './ai-constants'
import { validateContentData } from './ai-content-data'
import { getBackgroundById } from './social-template/backgroundCatalog'
import { SPONSOR_MAX_BYTES, validateSponsorLogo } from './social-template/eventFormHelpers'
import {
  EVENT_TEMPLATE_PRESENTATIONS,
  resolveTemplateLayoutId,
} from './social-template/templateLayouts'

const MAX_SPONSOR_DATA_URL_LENGTH = Math.ceil((SPONSOR_MAX_BYTES * 4) / 3) + 128
const MAX_PLATFORM_INPUTS = MAX_GUIDELINE_PLATFORMS

const boundedRequiredString = (max) => z.string().trim().min(1).max(max)
const boundedOptionalString = (max) => boundedRequiredString(max).optional()
const boundedRawRequiredString = (max) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0, 'El texto no puede estar vacío')
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
    templatePresentation: z.enum(EVENT_TEMPLATE_PRESENTATIONS).optional(),
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
  .superRefine((value, ctx) => {
    if (value.templatePresentation && value.layout !== 'event') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'templatePresentation solo se admite para la plantilla de evento',
        path: ['templatePresentation'],
      })
    }
  })

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
    draftText: boundedRawRequiredString(20_000),
    rationale: boundedOptionalString(4000),
    assumptions: z.array(boundedRequiredString(2000)).max(50).optional(),
    missingInformation: z.array(boundedRequiredString(2000)).max(50).optional(),
    imagePrompt: boundedOptionalString(20_000),
    imageRationale: boundedOptionalString(4000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.imagePrompt && !value.imageRationale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'imageRationale es obligatorio cuando existe imagePrompt',
        path: ['imageRationale'],
      })
    }
  })

const AiPolicyReviewSchema = z
  .object({
    stage: z.enum(['caption', 'result']),
    disposition: z.enum(['block', 'review']),
    categories: z.array(boundedRequiredString(100)).min(1).max(20),
    reason: boundedRequiredString(1000),
    failClosed: z.boolean(),
    errorCode: boundedOptionalString(100),
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
    imageRationale: boundedRequiredString(4000),
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
    publicationTextSource: z.enum(['generated', 'provided']).optional(),
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

const AiRunCoordinationSchema = z
  .object({
    claimId: boundedRequiredString(200),
    coordination: z.enum(['s3', 'local']),
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
    generationMode: z.enum(['text_and_image', 'image_only']).default('text_and_image'),
    publicationText: boundedRawRequiredString(20_000).optional(),
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
    templatePresentation: z.enum(EVENT_TEMPLATE_PRESENTATIONS).optional(),
    sponsorLogo: AiSponsorLogoSchema.optional(),
    runCoordination: AiRunCoordinationSchema.optional(),
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

    if (value.generationMode === 'image_only' && !value.publicationText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'publicationText es obligatorio en modo image_only',
        path: ['publicationText'],
      })
    }
    if (value.generationMode === 'image_only' && !supportsImageForPlatforms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Guidelines no permiten generar imagen para este tipo y plataformas',
        path: ['generationMode'],
      })
    }
    if (value.templatePresentation && templateLayout !== 'event') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'templatePresentation solo se admite para la plantilla de evento',
        path: ['templatePresentation'],
      })
    }

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
