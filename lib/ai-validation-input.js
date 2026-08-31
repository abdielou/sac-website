import { z } from 'zod'
import { AI_BASE_POLICY_VERSION } from './ai-agent'
import { validateContentData } from './ai-content-data'
import {
  MAX_VALIDATION_IMAGE_DATA_URL_LENGTH,
  VALIDATION_IMAGE_MIME_TYPES,
  validateSerializedValidationImage,
} from './ai-validation-images'
import { normalizeValidationDraftText } from './ai-validation-result'

const ImageInputSchema = z
  .object({
    dataUrl: z.string().trim().min(1).max(MAX_VALIDATION_IMAGE_DATA_URL_LENGTH),
    mimeType: z.enum(VALIDATION_IMAGE_MIME_TYPES),
    fileName: z.string().trim().min(1).max(255).optional(),
    size: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const validation = validateSerializedValidationImage(value)
    if (!validation.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: validation.error, path: ['dataUrl'] })
    }
  })
  .transform((value) => validateSerializedValidationImage(value).image)

const ContentTypeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]{1,63}$/)

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
    guidelineVersion: z.string().trim().min(1).max(100),
  })
  .strict()

const AiRunCoordinationSchema = z
  .object({
    claimId: z.string().trim().min(1).max(200),
    coordination: z.enum(['s3', 'local']),
  })
  .strict()

export const ValidateInputSchema = z
  .object({
    userId: z.string().trim().min(1).max(256),
    userEmail: z.string().trim().email().max(254),
    platform: z.string().trim().min(1).max(64),
    platforms: z.array(z.string().trim().min(1).max(64)).min(1).max(10).optional(),
    contentType: ContentTypeIdSchema,
    contentData: z.record(z.any()),
    contentTypeDefinition: ContentTypeDefinitionSchema,
    contentTypeIdentity: ContentTypeIdentitySchema,
    guidelineVersion: z.string().trim().min(1).max(100),
    policyVersion: z.string().trim().min(1).max(100),
    draftText: z
      .string()
      .transform(normalizeValidationDraftText)
      .pipe(z.string().trim().min(1).max(20_000)),
    goal: z.string().trim().min(1).max(600).optional(),
    topic: z.string().trim().min(1).max(600).optional(),
    audience: z.string().trim().min(1).max(200).optional(),
    cta: z.string().trim().min(1).max(300).optional(),
    tone: z.string().trim().min(1).max(120).optional(),
    knownFacts: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    hashtags: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    links: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    eventDetails: z.record(z.any()).optional(),
    imageStyle: z.string().trim().min(1).max(500).optional(),
    imageConstraints: z.string().trim().min(1).max(1000).optional(),
    altText: z.string().trim().min(1).max(2000).optional(),
    images: z.array(ImageInputSchema).max(4).optional(),
    runCoordination: AiRunCoordinationSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.contentTypeDefinition.id !== value.contentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La definición no corresponde al tipo de contenido solicitado',
        path: ['contentTypeDefinition', 'id'],
      })
    }
    if (
      value.contentTypeIdentity.id !== value.contentType ||
      value.contentTypeIdentity.label !== value.contentTypeDefinition.label ||
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

    const contentDataValidation = validateContentData(
      value.contentData,
      value.contentTypeDefinition
    )
    for (const message of contentDataValidation.errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['contentData'] })
    }
  })
