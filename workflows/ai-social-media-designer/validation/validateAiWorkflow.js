import { fetch, getWorkflowMetadata } from 'workflow'
import { z } from 'zod'
import {
  AI_BASE_POLICY_VERSION,
  buildAgentSystemPrompt,
  formatUntrustedGuidelines,
  formatUntrustedRequest,
} from '../../../lib/ai-agent'
import { classifyAiPolicyRequest, reviewAiPolicyResult } from '../../../lib/ai-policy-review'
import { contentDataToLegacyInput, validateContentData } from '../../../lib/ai-content-data'
import { resolveGuidelinesFromDocument } from '../../../lib/ai-guidelines'
import { getGuidelineVersion } from '../../../lib/guidelines-store'
import {
  buildOpenRouterChatBody,
  extractOpenRouterUsage,
  mergeOpenRouterUsage,
} from '../../../lib/ai-openrouter'
import { buildValidationHistoryRecord } from '../../../lib/ai-run-history'
import {
  MAX_VALIDATION_IMAGE_DATA_URL_LENGTH,
  VALIDATION_IMAGE_MIME_TYPES,
  validateSerializedValidationImage,
} from '../../../lib/ai-validation-images'
import { persistRunHistory } from '../../../lib/run-history-store'

export { extractOpenRouterUsage, mergeOpenRouterUsage }

// ---------- Validation output schema (must match PRD) ----------

const IssueSchema = z.object({
  severity: z.enum(['minor', 'major', 'critical']),
  category: z.enum([
    'brand_voice',
    'guideline_compliance',
    'platform_fit',
    'clarity',
    'completeness',
    'uncertainty_factual_risk',
    'accessibility',
    'safety',
    'formatting',
    'privacy',
    'image_text_alignment',
    'image_suitability',
  ]),
  message: z.string(),
  suggestedFix: z.string().optional(),
  affectedPlatform: z.string().optional(),
})

export const AiValidationResultSchema = z.object({
  overallOutcome: z.enum(['pass', 'warning', 'fail']),
  approvalRecommendation: z.enum(['ready_for_review', 'needs_edits', 'do_not_publish']),
  summary: z.string(),
  issues: z.array(IssueSchema),
  platformNotes: z.string().optional(),
  imageNotes: z.string().optional(),
  suggestedRevision: z.string().optional(),
  humanReviewRequired: z.literal(true),
})

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

export const ValidateInputSchema = z
  .object({
    userId: z.string().trim().min(1).max(256),
    userEmail: z.string().trim().email().max(254),
    platform: z.string().trim().min(1).max(64),
    contentType: ContentTypeIdSchema,
    contentData: z.record(z.any()),
    contentTypeDefinition: ContentTypeDefinitionSchema,
    contentTypeIdentity: ContentTypeIdentitySchema,
    guidelineVersion: z.string().trim().min(1).max(100),
    policyVersion: z.string().trim().min(1).max(100),
    draftText: z.string().trim().min(1).max(20_000),
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

export function buildFallbackResult(input, reason) {
  return AiValidationResultSchema.parse({
    overallOutcome: 'fail',
    approvalRecommendation: 'do_not_publish',
    summary: `No fue posible validar automáticamente: ${reason}. Se requiere revisión humana.`,
    issues: [
      {
        severity: 'major',
        category: 'uncertainty_factual_risk',
        message: `Validación fallida: ${reason}`,
        suggestedFix: 'Revisar el borrador y, si aplica, contrastar detalles con fuentes internas.',
        affectedPlatform: input.platform,
      },
    ],
    platformNotes: 'La validación automática falló; no bloquea el flujo manual.',
    imageNotes:
      input.images && input.images.length > 0
        ? 'Incluiste imágenes, pero la validación automática no pudo completarse.'
        : undefined,
    suggestedRevision: input.draftText,
    humanReviewRequired: true,
  })
}

async function validatePayloadStep(input) {
  'use step'
  const parsed = ValidateInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'Input inválido (schema)',
      fallback: buildFallbackResult(
        {
          userId: input.userId || 'unknown',
          userEmail: input.userEmail || 'unknown@example.com',
          platform: input.platform || 'unknown',
          contentType: input.contentType || 'unknown',
          draftText: input.draftText || '',
          images: input.images,
          goal: input.goal,
          audience: input.audience,
          cta: input.cta,
          hashtags: input.hashtags,
          links: input.links,
          eventDetails: input.eventDetails,
          altText: input.altText,
        },
        'Input inválido'
      ),
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
    if (!Object.prototype.hasOwnProperty.call(document.platforms || {}, input.platform)) {
      return { ok: false, reason: 'platform_unavailable' }
    }

    const resolved = resolveGuidelinesFromDocument(document, {
      platform: input.platform,
      contentType: input.contentType,
    })
    const definition = resolved.contentTypeDefinition
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

    const exactInputResult = ValidateInputSchema.safeParse({
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
      ...resolved,
      ok: true,
      input: {
        ...exactInputResult.data,
        ...normalizedLegacyInput,
        goal:
          normalizedLegacyInput.intent || normalizedLegacyInput.topic || exactInputResult.data.goal,
        contentTypeDefinition: definition,
        contentTypeIdentity: resolved.contentTypeIdentity,
      },
    }
  } catch (error) {
    console.error('validateAiWorkflow: failed to load pinned guidelines', error)
    return { ok: false, reason: 'guideline_version_unavailable' }
  }
}

function buildPolicyRequest(input) {
  return {
    platform: input.platform,
    contentType: input.contentType,
    contentData: input.contentData,
    draftText: input.draftText,
    goal: input.goal,
    topic: input.topic,
    audience: input.audience,
    cta: input.cta,
    tone: input.tone,
    knownFacts: input.knownFacts,
    hashtags: input.hashtags,
    links: input.links,
    eventDetails: input.eventDetails,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    altText: input.altText,
  }
}

function buildPolicyGuidelines(guidelines) {
  return {
    version: guidelines.version,
    global: guidelines.global,
    platform: guidelines.platform,
    captionMaxCharacters: guidelines.captionMaxCharacters ?? null,
    contentType: guidelines.contentType,
    prohibited: guidelines.prohibited,
    imageValidation: guidelines.imageValidation,
    contentTypeDefinition: guidelines.contentTypeDefinition,
  }
}

export function applyConfiguredCaptionLimit(result, input, guidelines) {
  const limit = guidelines?.captionMaxCharacters
  if (!Number.isInteger(limit) || limit < 1 || input.draftText.length <= limit) return result

  const issues = Array.isArray(result.issues) ? [...result.issues] : []
  const alreadyReported = issues.some(
    (issue) => issue.category === 'platform_fit' && /caracter/i.test(issue.message || '')
  )
  if (!alreadyReported) {
    issues.push({
      severity: 'major',
      category: 'platform_fit',
      message: `El caption tiene ${input.draftText.length} caracteres y el máximo configurado para ${input.platform} es ${limit}.`,
      suggestedFix: `Acortar el caption a ${limit} caracteres o menos.`,
      affectedPlatform: input.platform,
    })
  }

  return AiValidationResultSchema.parse({
    ...result,
    overallOutcome: result.overallOutcome === 'fail' ? 'fail' : 'warning',
    approvalRecommendation:
      result.approvalRecommendation === 'do_not_publish' ? 'do_not_publish' : 'needs_edits',
    issues,
    humanReviewRequired: true,
  })
}

function collectValidationImageUrls(input) {
  const urls = (input.images || []).map(({ dataUrl }) => dataUrl)
  const sponsorDataUrl = input.contentData?.sponsor?.dataUrl
  if (typeof sponsorDataUrl === 'string' && sponsorDataUrl.trim()) urls.push(sponsorDataUrl.trim())
  return urls
}

export function buildPolicyValidationResult(input, decision) {
  const unavailable = decision.failClosed === true
  const categories = Array.isArray(decision.categories) ? decision.categories.join(', ') : ''
  return AiValidationResultSchema.parse({
    overallOutcome: 'fail',
    approvalRecommendation: 'do_not_publish',
    summary: unavailable
      ? 'No fue posible confirmar el cumplimiento de la política base. No publiques este contenido.'
      : 'El contenido no cumple la política base de SAC y no debe publicarse.',
    issues: [
      {
        severity: unavailable ? 'major' : 'critical',
        category: unavailable ? 'uncertainty_factual_risk' : 'safety',
        message: decision.reason || 'La revisión de política no pudo aprobar el contenido.',
        suggestedFix: unavailable
          ? 'Solicita una revisión humana antes de continuar.'
          : 'Ajusta el contenido al alcance social y a las restricciones de SAC.',
        affectedPlatform: input.platform,
      },
    ],
    platformNotes: categories ? `Categorías de política: ${categories}.` : undefined,
    imageNotes:
      input.images?.length > 0
        ? 'Las imágenes tampoco deben usarse hasta completar una revisión segura.'
        : undefined,
    humanReviewRequired: true,
  })
}

async function classifyPolicyRequestStep(input, guidelines) {
  'use step'
  return classifyAiPolicyRequest(
    {
      request: buildPolicyRequest(input),
      guidelines: buildPolicyGuidelines(guidelines),
      images: collectValidationImageUrls(input),
    },
    { fetchImpl: fetch }
  )
}

async function reviewPolicyResultStep(input, guidelines, result) {
  'use step'
  return reviewAiPolicyResult(
    {
      request: buildPolicyRequest(input),
      result,
      guidelines: buildPolicyGuidelines(guidelines),
      images: collectValidationImageUrls(input),
    },
    { fetchImpl: fetch }
  )
}

async function callOpenRouterStep(input, guidelines) {
  'use step'

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite-image'

  if (!apiKey) {
    return {
      ok: false,
      reason: 'Falta OPENROUTER_API_KEY',
      model,
      result: buildFallbackResult(input, 'Falta configuración del provider'),
      usage: null,
    }
  }

  const siteUrl = process.env.OPENROUTER_SITE_URL
  const openRouterTitle = process.env.OPENROUTER_TITLE

  const systemPrompt = buildAgentSystemPrompt({
    modeInstructions: `INSTRUCCIONES OPERATIVAS DEL VALIDADOR

En modo validación, evalúa publicaciones para SAC.
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "overallOutcome": "pass" | "warning" | "fail",
  "approvalRecommendation": "ready_for_review" | "needs_edits" | "do_not_publish",
  "summary": string,
  "issues": [
    {
      "severity": "minor" | "major" | "critical",
      "category": "brand_voice" | "guideline_compliance" | "platform_fit" | "clarity" | "completeness" | "uncertainty_factual_risk" | "accessibility" | "safety" | "formatting" | "privacy" | "image_text_alignment" | "image_suitability",
      "message": string,
      "suggestedFix": string (opcional),
      "affectedPlatform": string (opcional)
    }
  ],
  "platformNotes": string (opcional),
  "imageNotes": string (opcional),
  "suggestedRevision": string (opcional),
  "humanReviewRequired": true
}

Reglas:
- Usa EXACTAMENTE esas claves y esos valores permitidos. "humanReviewRequired" debe ser siempre true.
- "issues" siempre es un arreglo (usa [] si no hay problemas).
- No inventes datos no provistos (fechas, lugares, costos, enlaces, hechos científicos verificables).
- Astronomía: NO verificas hechos; si hay riesgo de afirmaciones no verificables, marca uncertainty_factual_risk.
`,
  })

  const userText = {
    platform: input.platform,
    contentType: input.contentType,
    draftText: input.draftText,
    goal: input.goal,
    topic: input.topic,
    audience: input.audience,
    cta: input.cta,
    tone: input.tone,
    knownFacts: input.knownFacts,
    hashtags: input.hashtags,
    links: input.links,
    eventDetails: input.eventDetails,
    imageStyle: input.imageStyle,
    imageConstraints: input.imageConstraints,
    altText: input.altText,
    imageCount: collectValidationImageUrls(input).length,
  }

  const messageContent = [
    {
      type: 'text',
      text: `${formatUntrustedGuidelines(buildPolicyGuidelines(guidelines))}
Validar el borrador y retornar AiValidationResult.
${formatUntrustedRequest(userText)}`,
    },
  ]

  const validationImageUrls = collectValidationImageUrls(input)
  if (validationImageUrls.length > 0) {
    for (const dataUrl of validationImageUrls) {
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: dataUrl,
        },
      })
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: messageContent },
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
          temperature: 0.2,
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

    const validated = AiValidationResultSchema.parse(json)
    return { result: validated, usage }
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
        result: buildFallbackResult(input, err1?.message || 'Fallo provider/modelo'),
        usage: accumulatedUsage,
      }
    }
  }
}

/**
 * Build + persist history inside a step.
 * Node crypto (userKey hash) and AWS SDK are not allowed in the workflow VM.
 * Soft-fail: never rewrite client terminal status on history errors.
 */
async function persistValidationHistoryStep(payload) {
  'use step'
  try {
    const record = buildValidationHistoryRecord(payload)
    await persistRunHistory(record)
  } catch (error) {
    console.error('validateAiWorkflow: failed to persist run history', error)
  }
  return null
}

export async function validateAiWorkflow(input) {
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
      await persistValidationHistoryStep({
        input,
        runId,
        status: 'completed',
        result: validatedInputResult.fallback,
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: null,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: input?.contentTypeIdentity,
      })
    }
    return { result: validatedInputResult.fallback, usage: null }
  }

  const validatedInput = validatedInputResult.value
  const guidelines = await loadGuidelinesStep(validatedInput)
  if (!guidelines.ok) {
    const fallback = buildFallbackResult(
      validatedInput,
      'la versión de Guidelines fijada no está disponible'
    )
    const completedAt = new Date().toISOString()
    if (runId) {
      await persistValidationHistoryStep({
        input: validatedInput,
        runId,
        status: 'completed',
        result: fallback,
        startedAt,
        completedAt,
        guidelineVersion: validatedInput.guidelineVersion,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: validatedInput.contentTypeIdentity,
      })
    }
    return {
      result: fallback,
      usage: null,
      guidelineVersion: validatedInput.guidelineVersion,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeIdentity: validatedInput.contentTypeIdentity,
    }
  }

  const runtimeInput = guidelines.input
  const requestPolicy = await classifyPolicyRequestStep(runtimeInput, guidelines)
  if (requestPolicy.decision !== 'allow') {
    const policyResult = buildPolicyValidationResult(runtimeInput, requestPolicy)
    const completedAt = new Date().toISOString()
    if (runId) {
      await persistValidationHistoryStep({
        input: runtimeInput,
        runId,
        status: 'completed',
        result: policyResult,
        startedAt,
        completedAt,
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        model: requestPolicy.model,
        usage: requestPolicy.usage,
      })
    }
    return {
      result: policyResult,
      usage: requestPolicy.usage ?? null,
      guidelineVersion: guidelines.version,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeIdentity: guidelines.contentTypeIdentity,
    }
  }

  const modelResult = await callOpenRouterStep(runtimeInput, guidelines)
  let finalResult = modelResult.result
  let usage = mergeOpenRouterUsage(requestPolicy.usage, modelResult.usage)
  let finalModel = modelResult.model || requestPolicy.model

  if (modelResult.ok !== false) {
    const resultPolicy = await reviewPolicyResultStep(runtimeInput, guidelines, modelResult.result)
    usage = mergeOpenRouterUsage(usage, resultPolicy.usage)
    finalModel = resultPolicy.model || finalModel
    if (resultPolicy.decision !== 'allow') {
      finalResult = buildPolicyValidationResult(runtimeInput, resultPolicy)
    }
  }

  finalResult = applyConfiguredCaptionLimit(finalResult, runtimeInput, guidelines)

  const completedAt = new Date().toISOString()

  if (runId) {
    await persistValidationHistoryStep({
      input: runtimeInput,
      runId,
      status: 'completed',
      result: finalResult,
      startedAt,
      completedAt,
      guidelineVersion: guidelines?.version,
      policyVersion: AI_BASE_POLICY_VERSION,
      contentTypeIdentity: guidelines.contentTypeIdentity,
      model: finalModel,
      usage,
    })
  }

  return {
    result: finalResult,
    usage: usage ?? null,
    guidelineVersion: guidelines?.version ?? null,
    policyVersion: AI_BASE_POLICY_VERSION,
    contentTypeIdentity: guidelines.contentTypeIdentity,
  }
}
