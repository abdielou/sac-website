import { fetch, getWorkflowMetadata } from 'workflow'
import {
  AI_BASE_POLICY_VERSION,
  buildAgentSystemPrompt,
  formatUntrustedGuidelines,
  formatUntrustedRequest,
  formatUntrustedResult,
} from '../../../lib/ai-agent'
import { classifyAiPolicyRequest, reviewAiPolicyResult } from '../../../lib/ai-policy-review'
import { contentDataToLegacyInput } from '../../../lib/ai-content-data'
import { resolveGuidelinesFromDocument } from '../../../lib/ai-guidelines'
import { getGuidelineVersion } from '../../../lib/guidelines-store'
import {
  attachOpenRouterAttemptMetadata,
  extractFirstJsonObject,
  getConfiguredOpenRouterModels,
  mergeOpenRouterUsage,
  shouldRetryOpenRouterOperation,
} from '../../../lib/ai-openrouter'
import { generateOpenRouterText } from '../../../lib/ai-openrouter-sdk'
import { buildAiRunFailure } from '../../../lib/ai-run-failure'
import { buildValidationHistoryRecord } from '../../../lib/ai-run-history'
import { ValidateInputSchema } from '../../../lib/ai-validation-input'
import {
  AiValidationModelResultSchema,
  buildFallbackResult,
  buildPolicyValidationResult,
  finalizeValidationResult,
  reconcileModelSuggestedRevision,
  resolveValidationPlatforms,
  shouldApplyValidationPolicyBlock,
} from '../../../lib/ai-validation-result'
import { persistAiRunFailure, persistRunHistory } from '../../../lib/run-history-store'
import { confirmRunClaimStep } from '../shared/confirmRunClaim'

const VALIDATION_MODEL_TIMEOUT_MS = 30_000
const VALIDATION_MODEL_MAX_OUTPUT_TOKENS = 2_000
const REVISION_CONTRACT_CODES = new Set([
  'UNEXPLAINED_SUGGESTED_REVISION',
  'INVALID_TEXT_CORRECTION',
  'AMBIGUOUS_TEXT_CORRECTION',
  'CONFLICTING_TEXT_CORRECTIONS',
  'OVERLAPPING_TEXT_CORRECTIONS',
  'SUGGESTED_REVISION_MISMATCH',
])

function isOpenRouterSdkError(error) {
  return error?.name === 'OpenRouterSdkError'
}

function shouldRetryValidationModel(error) {
  return shouldRetryOpenRouterOperation(error)
}

function buildValidationModelFailure(error, { configuration = false } = {}) {
  if (configuration || error?.name === 'OpenRouterConfigurationError') {
    return buildAiRunFailure({
      code: 'validation_provider_configuration_error',
      stage: 'validation_model',
      retryable: false,
      message:
        'La validación automática no está disponible por un problema de configuración. Contacta al administrador de SAC.',
    })
  }

  if (isOpenRouterSdkError(error)) {
    const retryable = shouldRetryOpenRouterOperation(error)
    return buildAiRunFailure({
      code: retryable ? 'validation_provider_unavailable' : 'validation_provider_rejected',
      stage: 'validation_model',
      retryable,
      message: retryable
        ? 'No pudimos completar la validación automática. Intenta nuevamente.'
        : 'La validación automática no está disponible por un problema de configuración. Contacta al administrador de SAC.',
    })
  }

  const retryable = shouldRetryOpenRouterOperation(error)
  return buildAiRunFailure({
    code: retryable ? 'validation_model_invalid_response' : 'validation_model_processing_error',
    stage: 'validation_model',
    retryable,
    message: retryable
      ? 'La validación automática devolvió una respuesta inválida. Intenta nuevamente.'
      : 'La validación automática no pudo completar el procesamiento. Contacta al administrador de SAC.',
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
  const model = getConfiguredOpenRouterModels().textModel

  if (!apiKey) {
    return {
      ok: false,
      model,
      failure: buildValidationModelFailure(null, { configuration: true }),
      usage: null,
    }
  }

  const systemPrompt = buildAgentSystemPrompt({
    modeInstructions: `INSTRUCCIONES OPERATIVAS DEL VALIDADOR

En modo validación, evalúa un paquete compartido para las redes sociales de SAC.
Devuelve EXACTAMENTE un objeto JSON (sin texto adicional, sin markdown) con esta forma:

{
  "summary": string,
  "issues": [
    {
      "severity": "suggestion" | "minor" | "major" | "critical",
      "category": "brand_voice" | "guideline_compliance" | "platform_fit" | "clarity" | "completeness" | "uncertainty_factual_risk" | "accessibility" | "safety" | "formatting" | "privacy" | "image_text_alignment" | "image_suitability",
      "message": string,
      "suggestedFix": string (opcional),
      "affectedPlatform": string (opcional),
      "textCorrections": [
        {
          "before": string,
          "after": string,
          "occurrence": integer positivo (opcional)
        }
      ] (opcional)
    }
  ],
  "platformNotes": string (opcional),
  "platformNotesByPlatform": { "id_de_red": string } (opcional),
  "imageNotes": string (opcional),
  "imageNotesByImage": [
    {
      "imageIndex": integer entre 1 y 4,
      "fileName": string (opcional),
      "notes": string
    }
  ] (opcional),
  "suggestedRevision": string (opcional)
}

Reglas:
- Usa EXACTAMENTE esas claves y esos valores permitidos.
- "issues" siempre es un arreglo (usa [] si no hay problemas).
- No incluyas una cantidad numérica de hallazgos en "summary"; el sistema puede consolidar correcciones equivalentes.
- Todas las cadenas de diagnóstico deben ser texto plano. No uses Markdown, asteriscos, guiones bajos ni backticks para dar énfasis.
- Tu responsabilidad es reportar hallazgos y correcciones. El sistema deriva el veredicto final de "issues"; no declares el contenido aprobado o listo para publicar.
- Evalúa el mismo caption y la misma imagen en TODAS las plataformas indicadas.
- Aplica conjuntamente las reglas generales, las del tipo y las de cada plataforma.
- Usa "affectedPlatform" cuando un problema corresponde solo a una red.
- Evalúa explícitamente cada regla recibida en las Guidelines. Si estas exigen revisar ortografía, acentuación, gramática o puntuación, reporta cada incumplimiento con category "guideline_compliance".
- Reporta una sola vez cada problema conceptual. Si una misma errata afecta ortografía y claridad, crea un solo hallazgo con la categoría más específica; no dupliques la misma corrección bajo categorías diferentes.
- Para todo hallazgo que cambie el borrador, incluye "textCorrections". Cada "before" debe ser una copia exacta y suficientemente contextual del borrador; "after" debe ser su reemplazo exacto. Si "before" aparece varias veces, incluye "occurrence" (comienza en 1).
- El conjunto de correcciones únicas debe reconstruir "suggestedRevision" exactamente. Nunca cambies texto en "suggestedRevision" que no esté declarado en "textCorrections".
- Si una frase canónica difiere en más de un aspecto, usa una sola corrección que abarque la frase completa y describe la discrepancia completa. Por ejemplo, "Sociedad Astronomica del Caribe" → "Sociedad de Astronomía del Caribe" es un solo hallazgo sobre el nombre institucional, no solo sobre una tilde.
- Una errata como "Telescopias" → "Telescopios" es un solo hallazgo; no la repitas como ortografía y claridad.
- Los hallazgos no textuales —por ejemplo, una imagen inadecuada o información ausente que no pueda insertarse sin inventar— deben omitir "textCorrections".
- Si "issues" está vacío, omite "suggestedRevision". No repitas el borrador original ni propongas reescrituras cosméticas o de preferencia.
- Incluye "suggestedRevision" solamente cuando aplique una o más "textCorrections" concretas. Conserva los párrafos, emojis y formato original salvo que una corrección declarada exija cambiarlos.
- Si no se adjuntó una imagen y esta era opcional, puedes incluir una recomendación en "imageNotes", pero no la reportes como un issue ni como incumplimiento.
- Cuando una observación corresponda a una imagen específica, inclúyela en "imageNotesByImage" con el índice basado en 1 y el fileName provistos en la solicitud. No atribuyas una observación a otra imagen.
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
    images: (input.images || []).map((image, index) => ({
      imageIndex: index + 1,
      fileName: image.fileName,
    })),
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
    const response = await generateOpenRouterText({
      apiKey,
      fetchImpl: fetch,
      model,
      messages: attemptMessages,
      temperature: 0,
      forceJson: true,
      maxOutputTokens: VALIDATION_MODEL_MAX_OUTPUT_TOKENS,
      timeoutMs: VALIDATION_MODEL_TIMEOUT_MS,
    })

    const usage = response.usage
    const assistantText = response.text
    if (!assistantText || typeof assistantText !== 'string') {
      throw attachOpenRouterAttemptMetadata(new Error('Respuesta del provider sin contenido'), {
        usage,
        retryable: true,
      })
    }

    const json = extractFirstJsonObject(assistantText)
    if (!json) {
      throw attachOpenRouterAttemptMetadata(new Error('No se pudo extraer JSON del contenido'), {
        usage,
        retryable: true,
      })
    }

    let parsed
    try {
      parsed = AiValidationModelResultSchema.parse(json)
    } catch (error) {
      throw attachOpenRouterAttemptMetadata(error, { usage, retryable: true })
    }
    try {
      const validated = reconcileModelSuggestedRevision(parsed, input)
      return { result: validated, usage }
    } catch (error) {
      const classified = attachOpenRouterAttemptMetadata(error, {
        usage,
        retryable: REVISION_CONTRACT_CODES.has(error?.code),
      })
      classified.modelResult = parsed
      throw classified
    }
  }

  let accumulatedUsage = null

  try {
    const first = await attempt()
    return { ok: true, model, result: first.result, usage: first.usage }
  } catch (err1) {
    accumulatedUsage = mergeOpenRouterUsage(accumulatedUsage, err1?.usage || null)
    if (!shouldRetryValidationModel(err1)) {
      return {
        ok: false,
        model,
        failure: buildValidationModelFailure(err1),
        usage: accumulatedUsage,
      }
    }

    try {
      const retryMessages = REVISION_CONTRACT_CODES.has(err1?.code)
        ? [
            {
              ...messages[0],
              content: `${messages[0].content}\n\nCORRECCIÓN DE CONTRATO: La respuesta anterior no vinculó de forma verificable los hallazgos con el texto corregido. Devuelve una sola corrección por problema, usa fragmentos exactos en textCorrections y asegúrate de que al aplicarlos se reconstruya suggestedRevision sin cambios adicionales.`,
            },
            messages[1],
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${formatUntrustedResult({
                    contractError: err1.message,
                    previousResult: err1.modelResult,
                  })}\nCorrige únicamente el contrato del diagnóstico y devuelve el objeto JSON completo.`,
                },
              ],
            },
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
        failure: buildValidationModelFailure(err2),
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
    const failure = payload.status === 'failed' ? payload.failure || payload.error : null
    await Promise.all([
      persistRunHistory(record),
      failure && payload.runId ? persistAiRunFailure(payload.runId, failure) : null,
    ])
  } catch (error) {
    console.error('validateAiWorkflow: failed to persist run terminal metadata', error)
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

  const claimConfirmation = await confirmRunClaimStep(input, runId, 'validate')
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
  let usage = mergeOpenRouterUsage(requestPolicy.usage, modelResult.usage)
  let finalModel = modelResult.model || requestPolicy.model

  if (modelResult.ok === false) {
    const failure = modelResult.failure || buildValidationModelFailure(null)
    console.error('validateAiWorkflow: validation model failed', failure.code)
    if (runId) {
      await persistValidationHistoryStep({
        input: runtimeInput,
        runId,
        status: 'failed',
        failure,
        startedAt,
        completedAt: new Date().toISOString(),
        guidelineVersion: guidelines.version,
        policyVersion: AI_BASE_POLICY_VERSION,
        contentTypeIdentity: guidelines.contentTypeIdentity,
        model: finalModel,
        usage,
      })
    }
    throw new Error(failure.message)
  }

  const resultPolicy = await reviewPolicyResultStep(runtimeInput, guidelines, modelResult.result)
  usage = mergeOpenRouterUsage(usage, resultPolicy.usage)
  finalModel = resultPolicy.model || finalModel

  const finalResult = finalizeValidationResult({
    result: modelResult.result,
    input: runtimeInput,
    guidelines,
    modelSucceeded: true,
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
