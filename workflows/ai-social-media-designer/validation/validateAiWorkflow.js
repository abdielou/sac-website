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
  buildOpenRouterTextChatBody,
  extractOpenRouterUsage,
  mergeOpenRouterUsage,
} from '../../../lib/ai-openrouter'
import { buildValidationHistoryRecord } from '../../../lib/ai-run-history'
import { confirmAiRunClaim } from '../../../lib/ai-run-lease-store'
import {
  MAX_VALIDATION_IMAGE_DATA_URL_LENGTH,
  VALIDATION_IMAGE_MIME_TYPES,
  validateSerializedValidationImage,
} from '../../../lib/ai-validation-images'
import { persistRunHistory } from '../../../lib/run-history-store'
import {
  AiValidationResultSchema,
  AiValidationModelResultSchema,
  buildFallbackResult,
  finalizeValidationResult,
  normalizeValidationDraftText,
  reconcileModelSuggestedRevision,
  resolveValidationPlatforms,
  shouldApplyValidationPolicyBlock,
} from '../../../lib/ai-validation-result'

export { extractOpenRouterUsage, mergeOpenRouterUsage }
export {
  AiValidationResultSchema,
  AiValidationModelResultSchema,
  applyConfiguredCaptionLimit,
  applySuggestedRevisionConsistency,
  buildFallbackResult,
  buildPolicyValidationResult,
  finalizeValidationResult,
  normalizeModelValidationVerdict,
  normalizeValidationDraftText,
  reconcileModelSuggestedRevision,
  shouldApplyPostValidationPolicyBlock,
  shouldApplyValidationPolicyBlock,
} from '../../../lib/ai-validation-result'

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

async function confirmRunClaimStep(input, runId) {
  'use step'
  if (!input?.runCoordination) return { ok: true, skipped: true }

  return confirmAiRunClaim({
    userId: input.userId,
    mode: 'validate',
    claimId: input.runCoordination.claimId,
    runId,
    coordination: input.runCoordination.coordination,
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
          platforms: input.platforms,
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
    const requestedPlatforms = resolveValidationPlatforms(input)
    if (
      requestedPlatforms.some(
        (platform) => !Object.prototype.hasOwnProperty.call(document.platforms || {}, platform)
      )
    ) {
      return { ok: false, reason: 'platform_unavailable' }
    }

    const byPlatform = Object.fromEntries(
      requestedPlatforms.map((platform) => [
        platform,
        resolveGuidelinesFromDocument(document, {
          platform,
          contentType: input.contentType,
        }),
      ])
    )
    const resolved = byPlatform[requestedPlatforms[0]]
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
      platforms: byPlatform,
      input: {
        ...exactInputResult.data,
        platforms: requestedPlatforms,
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
    platforms: resolveValidationPlatforms(input),
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
  const byPlatform = guidelines.platforms || null
  return {
    version: guidelines.version,
    global: guidelines.global,
    platform: guidelines.platform,
    platforms: byPlatform
      ? Object.fromEntries(
          Object.entries(byPlatform).map(([platform, value]) => [
            platform,
            {
              rules: value.platform,
              captionMaxCharacters: value.captionMaxCharacters ?? null,
            },
          ])
        )
      : undefined,
    captionMaxCharacters: guidelines.captionMaxCharacters ?? null,
    contentType: guidelines.contentType,
    prohibited: guidelines.prohibited,
    imageValidation: guidelines.imageValidation,
    contentTypeDefinition: guidelines.contentTypeDefinition,
  }
}

function collectValidationImageUrls(input) {
  const urls = (input.images || []).map(({ dataUrl }) => dataUrl)
  const sponsorDataUrl = input.contentData?.sponsor?.dataUrl
  if (typeof sponsorDataUrl === 'string' && sponsorDataUrl.trim()) urls.push(sponsorDataUrl.trim())
  return urls
}

async function classifyPolicyRequestStep(input, guidelines) {
  'use step'
  return classifyAiPolicyRequest(
    {
      request: buildPolicyRequest(input),
      guidelines: buildPolicyGuidelines(guidelines),
      images: collectValidationImageUrls(input),
      reviewMode: 'validation',
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
      reviewMode: 'validation',
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

En modo validación, evalúa un paquete compartido para las redes sociales de SAC.
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
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
  "platformNotesByPlatform": { "id_de_red": string } (opcional),
  "imageNotes": string (opcional),
  "suggestedRevision": string (opcional)
}

Reglas:
- Usa EXACTAMENTE esas claves y esos valores permitidos.
- "issues" siempre es un arreglo (usa [] si no hay problemas).
- Todas las cadenas de diagnóstico deben ser texto plano. No uses Markdown, asteriscos, guiones bajos ni backticks para dar énfasis.
- Tu responsabilidad es reportar hallazgos y correcciones. El sistema deriva el veredicto final de "issues"; no declares el contenido aprobado o listo para publicar.
- Evalúa el mismo caption y la misma imagen en TODAS las plataformas indicadas.
- Aplica conjuntamente las reglas generales, las del tipo y las de cada plataforma.
- Usa "affectedPlatform" cuando un problema corresponde solo a una red.
- Evalúa explícitamente cada regla recibida en las Guidelines. Si estas exigen revisar ortografía, acentuación, gramática o puntuación, reporta cada incumplimiento con category "guideline_compliance".
- Si "suggestedRevision" cambia el texto original para cumplir una regla de Guidelines, explica esos cambios en "issues"; nunca devuelvas una revisión distinta sin el hallazgo correspondiente.
- Si "issues" está vacío, omite "suggestedRevision". No repitas el borrador original ni propongas reescrituras cosméticas o de preferencia.
- Incluye "suggestedRevision" solamente cuando corrija uno o más hallazgos concretos de "issues". Conserva los párrafos, emojis y formato original salvo que uno de esos hallazgos exija cambiarlos.
- Si no se adjuntó una imagen y esta era opcional, puedes incluir una recomendación en "imageNotes", pero no la reportes como un issue ni como incumplimiento.
- Resume las observaciones particulares en "platformNotesByPlatform" usando los IDs recibidos.
- No inventes datos no provistos (fechas, lugares, costos, enlaces, hechos científicos verificables).
- Astronomía: NO verificas hechos; si hay riesgo de afirmaciones no verificables, marca uncertainty_factual_risk.
`,
  })

  const userText = {
    platform: input.platform,
    platforms: resolveValidationPlatforms(input),
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

  const attempt = async (attemptMessages = messages) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(siteUrl ? { 'HTTP-Referer': siteUrl } : null),
        ...(openRouterTitle ? { 'X-OpenRouter-Title': openRouterTitle } : null),
      },
      body: JSON.stringify(
        buildOpenRouterTextChatBody({
          model,
          messages: attemptMessages,
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

    const parsed = AiValidationModelResultSchema.parse(json)
    try {
      const validated = reconcileModelSuggestedRevision(parsed, input)
      return { result: validated, usage }
    } catch (error) {
      error.usage = usage
      throw error
    }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return { ok: true, model, result: first.result, usage: first.usage }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    try {
      const retryMessages =
        err1?.code === 'UNEXPLAINED_SUGGESTED_REVISION'
          ? [
              {
                ...messages[0],
                content: `${messages[0].content}\n\nCORRECCIÓN DE CONTRATO: La respuesta anterior incluyó un borrador sugerido materialmente distinto sin ningún hallazgo. Si no detectas problemas, devuelve issues: [] y omite suggestedRevision. Si el cambio es necesario, reporta primero el hallazgo que corrige.`,
              },
              messages[1],
            ]
          : messages
      const second = await attempt(retryMessages)
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

  const claimConfirmation = await confirmRunClaimStep(input, runId)
  if (!claimConfirmation?.ok) throw new Error('AI_RUN_CLAIM_LOST')

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
  if (shouldApplyValidationPolicyBlock(requestPolicy)) {
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
  let resultPolicy = null
  let usage = mergeOpenRouterUsage(requestPolicy.usage, modelResult.usage)
  let finalModel = modelResult.model || requestPolicy.model

  if (modelResult.ok !== false) {
    resultPolicy = await reviewPolicyResultStep(runtimeInput, guidelines, modelResult.result)
    usage = mergeOpenRouterUsage(usage, resultPolicy.usage)
    finalModel = resultPolicy.model || finalModel
  }

  const finalResult = finalizeValidationResult({
    result: modelResult.result,
    input: runtimeInput,
    guidelines,
    modelSucceeded: modelResult.ok !== false,
    policyDecision: resultPolicy,
  })

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
